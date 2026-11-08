import { DocumentAsset } from "../entities/document-asset.entity";
import { collectClaim } from "./document-storage-cleanup";
import { LATE_WRITE_WINDOW_MS } from "./document-storage-sweep";

const DAY_MS = 24 * 60 * 60 * 1000;

function tombstone(ageMs: number, uploadPending: boolean) {
  return {
    id: "asset-1",
    user_id: "user-1",
    cleanup_token: "token-1",
    cleanup_attempts: 0,
    upload_pending: uploadPending,
    created_at: new Date(Date.now() - ageMs),
  } as DocumentAsset;
}

function build() {
  const manager = { update: jest.fn(), delete: jest.fn() };
  return { db: { manager } as never, manager };
}

describe("collectClaim", () => {
  it("keeps the tombstone of an unsettled upload while a late write is still possible", async () => {
    const { db, manager } = build();

    const removed = await collectClaim(
      db,
      DocumentAsset,
      tombstone(2 * DAY_MS, true),
      async () => undefined,
    );

    expect(removed).toBe(true);
    expect(manager.delete).not.toHaveBeenCalled();
    expect(manager.update).toHaveBeenCalledWith(
      DocumentAsset,
      expect.objectContaining({ id: "asset-1", state: "deleting" }),
      { lease_expires_at: expect.any(Date) },
    );
  });

  it("drops the tombstone once the late-write window has passed", async () => {
    const { db, manager } = build();
    const remove = jest.fn().mockResolvedValue(undefined);

    await collectClaim(
      db,
      DocumentAsset,
      tombstone(LATE_WRITE_WINDOW_MS + DAY_MS, true),
      remove,
    );

    expect(remove).toHaveBeenCalledTimes(1);
    expect(manager.update).not.toHaveBeenCalled();
    expect(manager.delete).toHaveBeenCalledWith(
      DocumentAsset,
      expect.objectContaining({ id: "asset-1", cleanup_token: "token-1" }),
    );
  });

  it("deletes the row of a settled object right away", async () => {
    const { db, manager } = build();

    await collectClaim(
      db,
      DocumentAsset,
      tombstone(DAY_MS, false),
      async () => undefined,
    );

    expect(manager.delete).toHaveBeenCalledTimes(1);
  });
});
