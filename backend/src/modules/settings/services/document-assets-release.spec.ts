import { NotFoundException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { LogoStorageService } from "../../../common/services/logo-storage.service";
import { DocumentAsset } from "../entities/document-asset.entity";
import { DocumentAssetsService } from "./document-assets.service";
import {
  SIGNOFF_RELEASE_GRACE_MS,
  STORAGE_GRACE_MS,
} from "./document-storage-sweep";

const NOW = new Date("2026-11-10T12:00:00Z");

function releaseOf(kind: DocumentAsset["kind"] | null) {
  const manager = {
    findOne: jest.fn().mockResolvedValue(kind ? { id: "asset-1", kind } : null),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    query: jest.fn().mockResolvedValue([]),
  };
  const service = new DocumentAssetsService(
    {} as DataSource,
    {} as LogoStorageService,
  );
  return {
    manager,
    run: () => service.release("user-1", "asset-1", manager as never),
  };
}

const leaseSet = (manager: { update: jest.Mock }) =>
  (manager.update.mock.calls[0][2] as { lease_expires_at: Date })
    .lease_expires_at;

describe("DocumentAssetsService.release", () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => jest.useRealTimers());

  it("keeps a released logo for 24 hours and schedules no early sweep", async () => {
    const { manager, run } = releaseOf("logo");

    await run();

    expect(leaseSet(manager).getTime() - NOW.getTime()).toBe(STORAGE_GRACE_MS);
    expect(manager.query).not.toHaveBeenCalled();
  });

  it.each(["signature", "stamp"] as const)(
    "gives a released %s a short grace and a sweep when it ends",
    async (kind) => {
      const { manager, run } = releaseOf(kind);

      await run();

      expect(leaseSet(manager).getTime() - NOW.getTime()).toBe(
        SIGNOFF_RELEASE_GRACE_MS,
      );
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining("document_storage_sweeps"),
        ["user-1", SIGNOFF_RELEASE_GRACE_MS / 1000],
      );
    },
  );

  it("does nothing for an asset the account does not have", async () => {
    const { manager, run } = releaseOf(null);

    await run();

    expect(manager.update).not.toHaveBeenCalled();
    expect(manager.query).not.toHaveBeenCalled();
  });
});

describe("DocumentAssetsService.readSignoff", () => {
  const asset = {
    id: "asset-1",
    kind: "signature",
    state: "ready",
    object_key: "signoffs/user-1/a.png",
    sha256: "unused",
  };
  const serviceReading = (readImmutable: jest.Mock) =>
    new DocumentAssetsService(
      { manager: { findOne: jest.fn().mockResolvedValue(asset) } } as never,
      { readImmutable } as unknown as LogoStorageService,
    );

  it("answers a stored image whose object is gone with 404 FILE_NOT_FOUND", async () => {
    const noSuchKey = Object.assign(
      new Error("The specified key does not exist."),
      { code: "NoSuchKey", statusCode: 404 },
    );
    const service = serviceReading(jest.fn().mockRejectedValue(noSuchKey));

    const error = await service
      .readSignoff("user-1", "asset-1", "signature")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({
      errorCode: "FILE_NOT_FOUND",
    });
  });

  it("lets any other storage failure through unchanged", async () => {
    const outage = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    const service = serviceReading(jest.fn().mockRejectedValue(outage));

    await expect(
      service.readSignoff("user-1", "asset-1", "signature"),
    ).rejects.toBe(outage);
  });
});
