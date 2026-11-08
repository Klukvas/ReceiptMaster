import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { createHash, randomUUID } from "crypto";
import sharp = require("sharp");
import { LogoStorageService } from "../../../common/services/logo-storage.service";
import {
  SignoffKind,
  normalizeSignoffImage,
} from "../../../common/services/signoff-image";
import { DocumentAsset } from "../entities/document-asset.entity";
import { UserSettings } from "../entities/user-settings.entity";
import { STORAGE_GRACE_MS, STORAGE_BATCH } from "./document-storage-sweep";
import { DocumentDraft } from "../document-config";

import {
  abandonUpload,
  reserveUpload,
  settleUpload,
  collectClaim,
} from "./document-storage-cleanup";

@Injectable()
export class DocumentAssetsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly storage: LogoStorageService,
  ) {}

  async normalize(file?: Express.Multer.File): Promise<Buffer> {
    if (!file) throw new ConflictException("Logo replacement requires a file");
    return this.storage.normalizeLogo(file.buffer, file.mimetype);
  }

  async owned(
    userId: string,
    assetId: string,
    manager = this.db.manager,
    lock = false,
    kind: DocumentAsset["kind"] = "logo",
  ): Promise<DocumentAsset> {
    // The kind is part of the lookup: a logo pointer can never resolve to a signature.
    const asset = await manager.findOne(DocumentAsset, {
      where: { id: assetId, user_id: userId, kind },
      ...(lock ? { lock: { mode: "pessimistic_write" as const } } : {}),
    });
    if (!asset || asset.state !== "ready")
      throw new NotFoundException(
        kind === "logo" ? "Logo asset not available" : `No such ${kind} image`,
      );
    return asset;
  }

  /** The stored, integrity-checked PNG of a signature or stamp. */
  async readSignoff(
    userId: string,
    assetId: string,
    kind: SignoffKind,
  ): Promise<Buffer> {
    const asset = await this.owned(
      userId,
      assetId,
      this.db.manager,
      false,
      kind,
    );
    const bytes = await this.storage.readImmutable(
      asset.object_key,
      userId,
      "signoffs",
    );
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256)
      throw new ConflictException("Image integrity check failed");
    return bytes;
  }

  /**
   * Normalizes and uploads a signature or stamp as a new, still unreferenced asset.
   * Runs outside any transaction (storage I/O); the caller attaches it afterwards.
   */
  async stageSignoff(
    userId: string,
    kind: SignoffKind,
    file: Express.Multer.File,
  ): Promise<DocumentAsset> {
    const { png } = await normalizeSignoffImage(
      file.buffer,
      file.mimetype,
      kind,
    );
    return this.upload(userId, png, kind);
  }

  async read(userId: string, assetId: string): Promise<Buffer> {
    const asset = await this.owned(userId, assetId);
    const bytes = await this.storage.readImmutable(asset.object_key, userId);
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256)
      throw new ConflictException("Logo asset integrity check failed");
    return bytes;
  }

  async preview(
    userId: string,
    draft: DocumentDraft,
    file?: Express.Multer.File,
  ): Promise<Buffer | undefined> {
    if (draft.logoAction === "replace") return this.normalize(file);
    if (file) throw new ConflictException("Unexpected logo file");
    if (draft.logoAction === "remove") return undefined;
    if (draft.config.logo.assetId)
      return this.read(userId, draft.config.logo.assetId);
    const settings = await this.db.manager.findOne(UserSettings, {
      where: { userId },
    });
    if (!settings?.document_config && (await this.storage.userHasLogo(userId)))
      return this.storage.downloadLogo(userId);
    return undefined;
  }

  async stage(
    userId: string,
    draft: DocumentDraft,
    file?: Express.Multer.File,
  ): Promise<string | null> {
    if (draft.logoAction !== "replace" && file)
      throw new ConflictException("Unexpected logo file");
    if (draft.logoAction === "remove") return null;
    if (draft.logoAction === "keep" && draft.config.logo.assetId) {
      await this.owned(userId, draft.config.logo.assetId);
      return draft.config.logo.assetId;
    }
    const bytes =
      draft.logoAction === "replace"
        ? await this.normalize(file)
        : await this.preview(userId, draft);
    if (!bytes) return null;
    return (await this.upload(userId, bytes, "logo")).id;
  }

  /** Lease cycle shared by every kind: reserve, upload, settle (see document-storage-cleanup). */
  private async upload(
    userId: string,
    bytes: Buffer,
    kind: DocumentAsset["kind"],
  ): Promise<DocumentAsset> {
    const id = randomUUID();
    const prefix = kind === "logo" ? "logos" : "signoffs";
    const meta = await sharp(bytes).metadata();
    const asset = this.db.manager.create(DocumentAsset, {
      id,
      user_id: userId,
      kind,
      object_key: `${prefix}/${userId}/${id}.png`,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      width: meta.width,
      height: meta.height,
      state: "uploading",
      upload_pending: true,
      cleanup_token: randomUUID(),
      cleanup_attempts: 0,
      lease_expires_at: new Date(Date.now() + 86400000),
    });
    await this.db.transaction(async (manager) => {
      await reserveUpload(manager, userId);
      await manager.save(DocumentAsset, asset);
    });
    // Rejection can mean a remote PUT is still in flight; retain upload_pending intent.
    try {
      await this.storage.uploadImmutable(bytes, userId, id, prefix);
    } catch (error) {
      await abandonUpload(this.db, DocumentAsset, asset);
      throw error;
    }
    const ready = await settleUpload(this.db, DocumentAsset, asset);
    if (!ready) throw new ConflictException("Image upload lease expired");
    return asset;
  }

  async attach(
    userId: string,
    assetId: string | null,
    manager: EntityManager,
    kind: DocumentAsset["kind"] = "logo",
  ): Promise<void> {
    if (assetId) {
      await this.owned(userId, assetId, manager, true, kind);
      await this.release(userId, assetId, manager);
    }
  }

  async release(
    userId: string,
    assetId: string | null,
    manager: EntityManager,
  ): Promise<void> {
    if (assetId)
      await manager.update(
        DocumentAsset,
        { id: assetId, user_id: userId, state: "ready" },
        { lease_expires_at: new Date(Date.now() + 86400000) },
      );
  }

  /** Called by scheduled tenant maintenance; no eager deletes after ambiguous commits. */
  async collectExpired(userId: string): Promise<number> {
    const claimed: DocumentAsset[] = await this.db.transaction(
      async (manager) => {
        const assets: DocumentAsset[] = await manager.query(
          `SELECT a.* FROM document_assets a WHERE a.user_id=$1 AND a.lease_expires_at < now() AND NOT EXISTS (SELECT 1 FROM user_settings s WHERE s."userId"=$1::text AND (s.logo_asset_id=a.id OR s.signature_asset_id=a.id OR s.stamp_asset_id=a.id)) AND NOT EXISTS (SELECT 1 FROM document_presets p WHERE p.user_id=$1 AND p.logo_asset_id=a.id) AND NOT EXISTS (SELECT 1 FROM receipts r WHERE r.user_id=$1 AND (r.active_logo_asset_id=a.id OR r.pending_logo_asset_id=a.id)) ORDER BY a.lease_expires_at,a.id LIMIT ${STORAGE_BATCH} FOR UPDATE OF a SKIP LOCKED`,
          [userId],
        );
        const confirmed: DocumentAsset[] = [];
        for (const asset of assets) {
          const references: Array<{ used: boolean }> = await manager.query(
            `SELECT EXISTS(SELECT 1 FROM user_settings WHERE "userId"=$1::text AND (logo_asset_id=$2 OR signature_asset_id=$2 OR stamp_asset_id=$2) UNION ALL SELECT 1 FROM document_presets WHERE user_id=$1::uuid AND logo_asset_id=$2 UNION ALL SELECT 1 FROM receipts WHERE user_id=$1::uuid AND (active_logo_asset_id=$2 OR pending_logo_asset_id=$2)) AS used`,
            [userId, asset.id],
          );
          if (references[0]?.used) continue;
          const cleanup_token = randomUUID();
          await manager.update(
            DocumentAsset,
            { id: asset.id, user_id: userId },
            {
              state: "deleting",
              cleanup_token,
              lease_expires_at: new Date(Date.now() + STORAGE_GRACE_MS),
            },
          );
          confirmed.push({ ...asset, cleanup_token });
        }
        return confirmed;
      },
    );
    let collected = 0;
    for (const asset of claimed) {
      if (
        await collectClaim(this.db, DocumentAsset, asset, () =>
          this.storage.removeImmutable(asset.object_key, userId),
        )
      )
        collected++;
    }
    return collected;
  }
}
