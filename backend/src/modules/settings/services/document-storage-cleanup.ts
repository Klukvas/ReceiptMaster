import { ConflictException, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { DataSource, EntityManager, MoreThan } from "typeorm";
import { DocumentAsset } from "../entities/document-asset.entity";
import { DocumentArtifact } from "../../receipts/entities/document-artifact.entity";
import {
  scheduleStorageSweep,
  STORAGE_BATCH,
  STORAGE_GRACE_MS,
} from "./document-storage-sweep";

type StoredObject = DocumentAsset | DocumentArtifact;
type StoredEntity = typeof DocumentAsset | typeof DocumentArtifact;
const logger = new Logger("DocumentStorageCleanup");

/** Bound live in-flight leases; uncertain expired PUT intent remains durable for cleanup. */
export async function reserveUpload(
  manager: EntityManager,
  userId: string,
): Promise<void> {
  await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 2))", [
    userId,
  ]);
  const live =
    (await manager.count(DocumentAsset, {
      where: {
        user_id: userId,
        upload_pending: true,
        state: "uploading",
        lease_expires_at: MoreThan(new Date()),
      },
    })) +
    (await manager.count(DocumentArtifact, {
      where: {
        user_id: userId,
        upload_pending: true,
        state: "uploading",
        lease_expires_at: MoreThan(new Date()),
      },
    }));
  if (live >= STORAGE_BATCH)
    throw new ConflictException("Storage uploads in flight; retry later");
  await scheduleStorageSweep(manager, userId);
}

/** Storage has settled, but expiry/collection may have fenced this uploader already.
 * Keep/recreate intent with a new token, never delete eagerly after an ambiguous result.
 */
export async function settleUpload<T extends StoredObject>(
  db: DataSource,
  entity: StoredEntity,
  original: T,
): Promise<boolean> {
  return db.transaction(async (manager) => {
    const current = await manager.findOne<StoredObject>(entity, {
      where: { id: original.id, user_id: original.user_id },
      lock: { mode: "pessimistic_write" },
    });
    const eligible =
      current?.state === "uploading" &&
      current.lease_expires_at.getTime() > Date.now();
    const value = {
      ...(current || original),
      state: eligible ? ("ready" as const) : ("deleting" as const),
      upload_pending: false,
      cleanup_token: randomUUID(),
      cleanup_attempts: 0,
      lease_expires_at: new Date(Date.now() + STORAGE_GRACE_MS),
    };
    await manager.save(entity, value);
    await scheduleStorageSweep(manager, original.user_id);
    return eligible;
  });
}

/** A claim token fences database finalization, including a resumed uploader's fresh intent.
 * Unsettled PUTs retain tombstones; they can complete arbitrarily late. Deleting tombstones
 * never consume live upload capacity, even when retries extend their cleanup deadline.
 * Storage calls are always outside transactions. Failed claims move behind peers.
 */
export async function collectClaim(
  db: DataSource,
  entity: StoredEntity,
  asset: StoredObject,
  remove: () => Promise<void>,
): Promise<boolean> {
  const where = {
    id: asset.id,
    user_id: asset.user_id,
    state: "deleting" as const,
    cleanup_token: asset.cleanup_token,
  };
  try {
    await remove();
    if (asset.upload_pending) {
      await db.manager.update(entity, where, {
        lease_expires_at: new Date(Date.now() + STORAGE_GRACE_MS),
      });
    } else {
      await db.manager.delete(entity, where);
    }
    return true;
  } catch (error) {
    const attempts = Math.min((asset.cleanup_attempts || 0) + 1, 10);
    await db.manager.update(entity, where, {
      cleanup_attempts: attempts,
      lease_expires_at: new Date(
        Date.now() + Math.min(24 * 60, 2 ** attempts) * 60000,
      ),
    });
    logger.warn(
      `Object cleanup will retry: ${error instanceof Error ? error.message : "storage unavailable"}`,
    );
    return false;
  }
}
