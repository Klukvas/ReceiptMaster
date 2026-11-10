import { DataSource, EntityManager } from "typeorm";
import { CacheService } from "../../../common/services/cache.service";
import { UserSettings } from "../entities/user-settings.entity";
import { DocumentAssetsService } from "./document-assets.service";
import { DocumentConfigService } from "./document-config.service";

type Row = Partial<UserSettings> & { id: string };

describe("DocumentConfigService.patchLegacy passthrough", () => {
  let row: Row;
  let service: DocumentConfigService;

  beforeEach(() => {
    row = {
      id: "settings-1",
      userId: "user-1",
      templateId: "standard",
      templateLanguage: "en",
      companyName: "Old LLC",
      document_config: null,
      document_config_revision: 0,
      logo_asset_id: null,
    };
    const manager = {
      query: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(async (entity: unknown) =>
        entity === UserSettings ? { ...row } : null,
      ),
      update: jest.fn(
        async (_entity: unknown, _where: unknown, values: Partial<Row>) => {
          row = { ...row, ...values };
        },
      ),
    };
    const db = {
      manager,
      transaction: (work: (m: EntityManager) => Promise<void>) =>
        work(manager as unknown as EntityManager),
    };
    const assets = {
      stage: jest.fn().mockResolvedValue(null),
      attach: jest.fn(),
      release: jest.fn(),
    };
    service = new DocumentConfigService(
      db as unknown as DataSource,
      assets as unknown as DocumentAssetsService,
      {
        del: jest.fn().mockResolvedValue(undefined),
      } as unknown as CacheService,
    );
  });

  it("stores requisites in their columns and keeps them out of document_config", async () => {
    await service.patchLegacy(
      "user-1",
      { companyName: "New LLC" },
      {
        companyVatId: "1234567890",
        companyVatPayer: true,
        companySignatoryName: "Ivan Petrenko",
        defaultPaymentTermDays: 14,
      },
    );

    expect(row).toMatchObject({
      companyName: "New LLC",
      companyVatId: "1234567890",
      companyVatPayer: true,
      companySignatoryName: "Ivan Petrenko",
      defaultPaymentTermDays: 14,
      document_config_revision: 1,
    });
    const stored = JSON.stringify(row.document_config);
    expect(stored).toContain("New LLC");
    for (const leaked of [
      "1234567890",
      "Ivan Petrenko",
      "companyVatId",
      "defaultPaymentTermDays",
    ]) {
      expect(stored).not.toContain(leaked);
    }
  });

  it("produces the same document_config with or without requisites", async () => {
    await service.patchLegacy("user-1", { companyName: "Same LLC" });
    const withoutRequisites = row.document_config;

    row = { ...row, document_config: null, document_config_revision: 0 };
    await service.patchLegacy(
      "user-1",
      { companyName: "Same LLC" },
      { companyBankName: "Bank", companyLegalForm: "ТОВ" },
    );

    expect(row.document_config).toEqual(withoutRequisites);
  });
});
