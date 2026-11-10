import { DocumentArtifactsService } from "./document-artifacts.service";
import { DocumentArtifact } from "../entities/document-artifact.entity";

// Regression: a rejected PDF upload used to stay `uploading` for the whole 24 h lease. Only
// `uploading` rows count against the live-upload cap (25), so a short storage outage locked
// the account out of every document and image upload for a day after storage recovered.
describe("DocumentArtifactsService.upload failure", () => {
  it("turns the lease into a deleting tombstone and rethrows the storage error", async () => {
    const update = jest.fn().mockResolvedValue({ affected: 1 });
    const manager = {
      query: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((_entity: unknown, value: object) => value),
      save: jest.fn(async (_entity: unknown, value: object) => value),
      update,
    };
    const db = {
      transaction: jest.fn(async (run: (m: typeof manager) => unknown) =>
        run(manager),
      ),
      manager,
    };
    const storageError = new Error("S3 down");
    const storage = {
      uploadReceipt: jest.fn().mockRejectedValue(storageError),
    };
    const service = new DocumentArtifactsService(db as never, storage as never);

    await expect(
      service.upload(Buffer.from("x"), "a.pdf", "user-1"),
    ).rejects.toBe(storageError);

    expect(update).toHaveBeenCalledWith(
      DocumentArtifact,
      expect.objectContaining({ user_id: "user-1", state: "uploading" }),
      expect.objectContaining({ state: "deleting" }),
    );
    // durable intent is kept for late-landing PUTs: upload_pending is never cleared here
    expect(update.mock.calls[0][2]).not.toHaveProperty("upload_pending");
  });
});
