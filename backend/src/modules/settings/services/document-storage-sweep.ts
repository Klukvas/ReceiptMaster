import { EntityManager } from "typeorm";

export const STORAGE_GRACE_MS = 24 * 60 * 60 * 1000;
export const STORAGE_BATCH = 25;

/** Operational queue contains tenant IDs and timing only, like the receipt outbox. */
export async function scheduleStorageSweep(
  manager: EntityManager,
  userId: string,
): Promise<void> {
  await manager.query(
    `INSERT INTO document_storage_sweeps(user_id,next_sweep_at) VALUES($1,now()+interval '24 hours')
    ON CONFLICT(user_id) DO UPDATE SET next_sweep_at=LEAST(document_storage_sweeps.next_sweep_at,EXCLUDED.next_sweep_at)`,
    [userId],
  );
}
