import {
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import {
  SIGNOFF_KINDS,
  SignoffKind,
  SignoffSource,
} from "../../../common/services/signoff-image";
import { DocumentAsset } from "../entities/document-asset.entity";
import { UserSettings } from "../entities/user-settings.entity";
import { DocumentAssetsService } from "./document-assets.service";
import { DocumentConfigService } from "./document-config.service";

export interface SignoffImageInfo {
  assetId: string;
  width: number;
  height: number;
  bytes: number;
  updatedAt: string;
}

export interface SignoffState {
  signature: SignoffImageInfo | null;
  stamp: SignoffImageInfo | null;
}

/** The images a render can use, plus the pointers they were read under. */
export interface SignoffLoad {
  source: SignoffSource;
  /** Kinds that are set on the account but could not be read, so they are not in `source`. */
  unavailable: SignoffKind[];
  /** What `user_settings` pointed at, usable or not; compared again under the settings lock. */
  pointers: SignoffPointers;
}

export interface SignoffPointers {
  signature: string | null;
  stamp: string | null;
}

/**
 * Pauses before the second and third attempt to read an image. A storage blip must not
 * silently strip the signature from a document that is about to be issued; a missing or
 * corrupt image (an HTTP error from the asset check) is final and is not retried.
 */
export const SIGNOFF_READ_RETRY_DELAYS_MS: readonly number[] = [150, 450];

const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const COLUMN = {
  signature: "signature_asset_id",
  stamp: "stamp_asset_id",
} as const;

/** The account's signature and stamp: which asset is current, and how it changes. */
@Injectable()
export class DocumentSignoffService {
  private readonly logger = new Logger(DocumentSignoffService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly assets: DocumentAssetsService,
    private readonly configs: DocumentConfigService,
  ) {}

  /** The current asset ids; the columns are `select: false`, hence the explicit query. */
  async pointers(
    userId: string,
    manager: EntityManager = this.db.manager,
  ): Promise<SignoffPointers> {
    const [row]: Array<{
      signature_asset_id: string | null;
      stamp_asset_id: string | null;
    }> = await manager.query(
      `SELECT "signature_asset_id", "stamp_asset_id" FROM "user_settings" WHERE "userId" = $1`,
      [userId],
    );
    return {
      signature: row?.signature_asset_id ?? null,
      stamp: row?.stamp_asset_id ?? null,
    };
  }

  /**
   * Current images with their bytes, for a render. An image that cannot be read (its object
   * is gone or fails its checksum, or the asset is no longer ready, e.g. after an older image's
   * cleanup ran) is left out and logged: documents must keep generating, just without it.
   * `pointers` still names what settings point at, so the later "did it change?" check
   * compares like with like and a broken image cannot cause an endless 409.
   */
  async load(userId: string): Promise<SignoffLoad> {
    const pointers = await this.pointers(userId);
    const reads = await Promise.all(
      SIGNOFF_KINDS.map(async (kind) => {
        const assetId = pointers[kind];
        if (!assetId) return undefined;
        try {
          const bytes = await this.readWithRetry(userId, assetId, kind);
          return { kind, image: { assetId, bytes } };
        } catch (error) {
          this.logger.warn(
            `Printing without the ${kind} image: user ${userId}, asset ${assetId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return { kind, image: undefined };
        }
      }),
    );
    const attempted = reads.filter((read) => read !== undefined);
    return {
      source: Object.fromEntries(
        attempted.flatMap(({ kind, image }) => (image ? [[kind, image]] : [])),
      ),
      unavailable: attempted.flatMap(({ kind, image }) =>
        image ? [] : [kind],
      ),
      pointers,
    };
  }

  private async readWithRetry(
    userId: string,
    assetId: string,
    kind: SignoffKind,
  ): Promise<Buffer> {
    for (const delay of SIGNOFF_READ_RETRY_DELAYS_MS) {
      try {
        return await this.assets.readSignoff(userId, assetId, kind);
      } catch (error) {
        if (error instanceof HttpException) throw error;
        await pause(delay);
      }
    }
    return this.assets.readSignoff(userId, assetId, kind);
  }

  async get(userId: string): Promise<SignoffState> {
    const pointers = await this.pointers(userId);
    const [signature, stamp] = await Promise.all(
      (["signature", "stamp"] as const).map((kind) =>
        this.describe(userId, kind, pointers[kind]),
      ),
    );
    return { signature, stamp };
  }

  async image(userId: string, kind: SignoffKind): Promise<Buffer> {
    const assetId = (await this.pointers(userId))[kind];
    if (!assetId) throw new NotFoundException(`No ${kind} image`);
    return this.assets.readSignoff(userId, assetId, kind);
  }

  /**
   * Storage work (normalize, upload) happens first and outside any transaction; only the
   * pointer switch is transactional, under the same account lock as every settings write.
   */
  async replace(
    userId: string,
    kind: SignoffKind,
    file: Express.Multer.File,
  ): Promise<SignoffImageInfo> {
    const asset = await this.assets.stageSignoff(userId, kind, file);
    await this.db.transaction(async (manager) => {
      await this.configs.lock(userId, manager);
      const previous = (await this.pointers(userId, manager))[kind];
      await this.assets.attach(userId, asset.id, manager, kind);
      await this.assets.release(userId, previous, manager);
      await this.setPointer(userId, kind, asset.id, manager);
    });
    return toInfo(asset);
  }

  /**
   * Detaches the image. The stored object is deleted by the scheduled cleanup after its
   * 24 hour grace, like a replaced logo; documents already issued embed their own copy.
   */
  async remove(userId: string, kind: SignoffKind): Promise<void> {
    await this.db.transaction(async (manager) => {
      await this.configs.lock(userId, manager);
      const previous = (await this.pointers(userId, manager))[kind];
      if (!previous) return;
      await this.assets.release(userId, previous, manager);
      await this.setPointer(userId, kind, null, manager);
    });
  }

  private async setPointer(
    userId: string,
    kind: SignoffKind,
    assetId: string | null,
    manager: EntityManager,
  ): Promise<void> {
    await manager.update(UserSettings, { userId }, { [COLUMN[kind]]: assetId });
  }

  private async describe(
    userId: string,
    kind: SignoffKind,
    assetId: string | null,
  ): Promise<SignoffImageInfo | null> {
    if (!assetId) return null;
    const asset = await this.db.manager.findOne(DocumentAsset, {
      where: { id: assetId, user_id: userId, kind, state: "ready" },
    });
    return asset ? toInfo(asset) : null;
  }
}

function toInfo(asset: DocumentAsset): SignoffImageInfo {
  return {
    assetId: asset.id,
    width: asset.width,
    height: asset.height,
    bytes: asset.bytes,
    updatedAt: (asset.created_at ?? new Date()).toISOString(),
  };
}
