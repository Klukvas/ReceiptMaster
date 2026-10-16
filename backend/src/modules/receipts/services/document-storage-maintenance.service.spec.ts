import { Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import { tenantStore } from "../../../common/tenancy/tenant-context";
import { DocumentAssetsService } from "../../settings/services/document-assets.service";
import { DocumentArtifactsService } from "./document-artifacts.service";
import { DocumentStorageMaintenanceService } from "./document-storage-maintenance.service";

const TENANT = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

/** Mirrors TypeORM's Postgres driver: UPDATE ... RETURNING resolves to [rows, rowCount]. */
function buildService(claimedRows: Array<{ user_id: string }>) {
  const query = jest.fn().mockResolvedValue([claimedRows, claimedRows.length]);
  const db = {
    transaction: jest.fn((work: (manager: unknown) => unknown) =>
      work({ query }),
    ),
  } as unknown as DataSource;
  const seenTenants: Array<string | undefined> = [];
  const collector = () => ({
    collectExpired: jest.fn(async () => {
      seenTenants.push(tenantStore.getStore()?.userId);
    }),
  });
  const assets = collector();
  const artifacts = collector();
  const service = new DocumentStorageMaintenanceService(
    db,
    assets as unknown as DocumentAssetsService,
    artifacts as unknown as DocumentArtifactsService,
  );
  return { service, assets, artifacts, seenTenants };
}

describe("DocumentStorageMaintenanceService.sweep", () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();
  });
  afterEach(() => warn.mockRestore());

  it("runs both collectors inside each claimed tenant's context", async () => {
    const { service, assets, artifacts, seenTenants } = buildService([
      { user_id: TENANT },
    ]);

    await service.sweep();

    expect(assets.collectExpired).toHaveBeenCalledWith(TENANT);
    expect(artifacts.collectExpired).toHaveBeenCalledWith(TENANT);
    expect(seenTenants).toEqual([TENANT, TENANT]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("stays quiet when no tenant is due", async () => {
    const { service, assets } = buildService([]);

    await service.sweep();

    expect(assets.collectExpired).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
