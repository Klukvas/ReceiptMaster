import { ConflictException, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import { DataSource, EntityManager } from "typeorm";
import { PdfStorageService } from "../../../common/services/pdf-storage.service";
import { DocumentArtifact } from "../entities/document-artifact.entity";
import {
  scheduleStorageSweep,
  STORAGE_BATCH,
  STORAGE_GRACE_MS,
} from "../../settings/services/document-storage-sweep";

import {
  reserveUpload,
  settleUpload,
  collectClaim,
} from "../../settings/services/document-storage-cleanup";

@Injectable()
export class DocumentArtifactsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly storage: PdfStorageService,
  ) {}

  private key(userId: string, filename: string): string {
    if (!/^[\w-]+\.pdf$/.test(filename)) throw new Error("Invalid PDF key");
    return `receipts/${userId}/${filename}`;
  }
  async upload(buffer: Buffer, filename: string, userId: string) {
    const object_key = this.key(userId, filename);
    const lease = await this.db.transaction(async (manager) => {
      await reserveUpload(manager, userId);
      return manager.save(
        DocumentArtifact,
        manager.create(DocumentArtifact, {
          id: randomUUID(),
          user_id: userId,
          object_key,
          state: "uploading",
          upload_pending: true,
          cleanup_token: randomUUID(),
          cleanup_attempts: 0,
          lease_expires_at: new Date(Date.now() + STORAGE_GRACE_MS),
        }),
      );
    });
    // An upload/commit error is ambiguous. Leave durable intent for reference-aware cleanup.
    const url = await this.storage.uploadReceipt(buffer, filename, userId);
    const ready = await settleUpload(this.db, DocumentArtifact, lease);
    if (!ready) throw new ConflictException("PDF upload lease expired");
    return { id: lease.id, url, path: `object-storage://${object_key}` };
  }
  async attach(
    userId: string,
    id: string,
    manager: EntityManager,
  ): Promise<void> {
    const lease = await manager.findOne(DocumentArtifact, {
      where: { id, user_id: userId },
      lock: { mode: "pessimistic_write" },
    });
    if (!lease || lease.state !== "ready")
      throw new ConflictException("PDF upload lease unavailable");
  }
  /** Register legacy keys too. Retirement and pointer removal commit together. */
  async retire(
    userId: string,
    path: string | null,
    manager: EntityManager,
  ): Promise<void> {
    const prefix = `object-storage://receipts/${userId}/`;
    if (!path?.startsWith(prefix)) return;
    const filename = path.slice(prefix.length),
      object_key = this.key(userId, filename);
    await manager.query(
      `INSERT INTO document_artifacts(id,user_id,object_key,state,lease_expires_at)
      VALUES($1,$2,$3,'ready',now()+interval '24 hours') ON CONFLICT(object_key) DO UPDATE
      SET lease_expires_at=now()+interval '24 hours' WHERE document_artifacts.user_id=$2 AND document_artifacts.state='ready'`,
      [randomUUID(), userId, object_key],
    );
    await scheduleStorageSweep(manager, userId);
  }
  async collectExpired(userId: string): Promise<number> {
    const claimed = await this.db.transaction(async (manager) => {
      const candidates: DocumentArtifact[] = await manager.query(
        `SELECT a.* FROM document_artifacts a
        WHERE a.user_id=$1 AND a.lease_expires_at < now()
        AND NOT EXISTS(SELECT 1 FROM receipts r WHERE r.user_id=$1 AND r.pdf_path='object-storage://'||a.object_key)
        ORDER BY a.lease_expires_at,a.id LIMIT ${STORAGE_BATCH} FOR UPDATE OF a SKIP LOCKED`,
        [userId],
      );
      const confirmed: DocumentArtifact[] = [];
      for (const asset of candidates) {
        const refs: Array<{ used: boolean }> = await manager.query(
          `SELECT EXISTS(SELECT 1 FROM receipts
          WHERE user_id=$1 AND pdf_path=$2) AS used`,
          [userId, `object-storage://${asset.object_key}`],
        );
        if (refs[0]?.used) continue;
        if (!asset.object_key.startsWith(`receipts/${userId}/`))
          throw new Error("Invalid PDF tenant key");
        const cleanup_token = randomUUID();
        await manager.update(
          DocumentArtifact,
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
    });
    let collected = 0;
    for (const asset of claimed) {
      if (
        await collectClaim(this.db, DocumentArtifact, asset, () =>
          this.storage.deleteReceipt(
            asset.object_key.slice(`receipts/${userId}/`.length),
            userId,
          ),
        )
      )
        collected++;
    }
    return collected;
  }
}
