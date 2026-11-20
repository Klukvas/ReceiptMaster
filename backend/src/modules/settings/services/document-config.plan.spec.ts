import { DataSource, EntityManager } from "typeorm";
import { CacheService } from "../../../common/services/cache.service";
import { PlanName } from "../../subscription/entities/user-subscription.entity";
import { UserSubscription } from "../../subscription/entities/user-subscription.entity";
import { DocumentPreset } from "../entities/document-preset.entity";
import { UserSettings } from "../entities/user-settings.entity";
import { legacyConfig } from "../document-config";
import { DocumentAssetsService } from "./document-assets.service";
import { DocumentConfigService } from "./document-config.service";

const USER = "user-1";
const FILE = { buffer: Buffer.from("png") } as Express.Multer.File;

/** A service over one settings row, a plan and a number of saved presets. */
function setup(options: {
  plan: PlanName | null;
  savedTemplate?: string;
  presetCount?: number;
}) {
  let row: Partial<UserSettings> & { id: string } = {
    id: "settings-1",
    userId: USER,
    templateId: options.savedTemplate ?? "standard",
    templateLanguage: "en",
    companyName: "Old LLC",
    document_config: null,
    document_config_revision: 0,
    logo_asset_id: null,
  };
  const manager = {
    query: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(async (entity: unknown) => {
      if (entity === UserSettings) return { ...row };
      if (entity === UserSubscription)
        return options.plan ? { user_id: USER, plan: options.plan } : null;
      return null;
    }),
    count: jest.fn(async (entity: unknown) =>
      entity === DocumentPreset ? (options.presetCount ?? 0) : 0,
    ),
    update: jest.fn(async (_e: unknown, _w: unknown, values: object) => {
      row = { ...row, ...values };
    }),
    create: jest.fn((_e: unknown, values: object) => values),
    save: jest.fn(async (_e: unknown, values: object) => ({
      id: "preset-1",
      ...values,
    })),
  };
  const db = {
    manager,
    transaction: (work: (m: EntityManager) => Promise<unknown>) =>
      work(manager as unknown as EntityManager),
  };
  const assets = {
    stage: jest.fn().mockResolvedValue(null),
    attach: jest.fn(),
    release: jest.fn(),
  };
  const service = new DocumentConfigService(
    db as unknown as DataSource,
    assets as unknown as DocumentAssetsService,
    { del: jest.fn().mockResolvedValue(undefined) } as unknown as CacheService,
  );
  return { service, assets, manager, currentRow: () => row };
}

const config = (templateId: string) => ({ ...legacyConfig(null), templateId });

describe("document configuration and the plan's templates", () => {
  it("falls back to the template every plan has when the saved default is no longer included", async () => {
    const { service } = setup({ plan: "free", savedTemplate: "compact" });

    const resolved = await service.resolve(USER, { logoAction: "keep" });

    expect(resolved.config.templateId).toBe("standard");
  });

  it("keeps a saved default the plan includes", async () => {
    const { service } = setup({ plan: "pro", savedTemplate: "compact" });

    const resolved = await service.resolve(USER, { logoAction: "keep" });

    expect(resolved.config.templateId).toBe("compact");
  });

  it("refuses a template picked for this document that the plan lacks", async () => {
    const { service } = setup({ plan: "free", savedTemplate: "standard" });

    await expect(
      service.resolve(USER, {
        logoAction: "keep",
        overrides: { templateId: "elegant" },
      }),
    ).rejects.toMatchObject({
      errorCode: "TEMPLATE_PLAN_RESTRICTED",
      statusCode: 402,
    });
  });

  it("still saves other settings while a template outside the plan stays selected", async () => {
    const { service, currentRow } = setup({
      plan: "free",
      savedTemplate: "compact",
    });

    await service.patchLegacy(USER, { companyName: "New LLC" });

    expect(currentRow()).toMatchObject({
      companyName: "New LLC",
      templateId: "compact",
    });
  });

  it("refuses switching to a template outside the plan", async () => {
    const { service } = setup({ plan: "free", savedTemplate: "standard" });

    await expect(
      service.save(USER, { config: config("compact"), logoAction: "keep" }, 0),
    ).rejects.toMatchObject({ errorCode: "TEMPLATE_PLAN_RESTRICTED" });
  });

  it("returns the plan's limits with the resolved configuration", async () => {
    const { service } = setup({ plan: null });

    const resolved = await service.resolve(USER, { logoAction: "keep" });

    expect(resolved.limits.hasAttribution).toBe(true);
  });
});

describe("the template a preview or a test receipt renders with", () => {
  it("is the fallback when the request is the saved default the plan lost", async () => {
    const { service } = setup({ plan: "free", savedTemplate: "compact" });

    await expect(service.templateForRender(USER, "compact")).resolves.toBe(
      "standard",
    );
  });

  it("is the requested template when the plan includes it", async () => {
    const { service } = setup({ plan: "pro", savedTemplate: "standard" });

    await expect(service.templateForRender(USER, "wave")).resolves.toBe("wave");
  });

  it("refuses a template outside the plan that is not the saved default", async () => {
    const { service } = setup({ plan: "free", savedTemplate: "compact" });

    await expect(
      service.templateForRender(USER, "elegant"),
    ).rejects.toMatchObject({ errorCode: "TEMPLATE_PLAN_RESTRICTED" });
  });
});

describe("document configuration and the plan's logo", () => {
  it("refuses a logo upload on a plan without the logo and stores nothing", async () => {
    const { service, assets } = setup({ plan: "free" });

    await expect(
      service.save(
        USER,
        { config: config("standard"), logoAction: "replace" },
        0,
        FILE,
      ),
    ).rejects.toMatchObject({
      errorCode: "PLAN_FEATURE_RESTRICTED",
      details: { feature: "logo" },
    });
    expect(assets.stage).not.toHaveBeenCalled();
  });

  it("accepts a logo upload on a plan that has it", async () => {
    const { service, assets } = setup({ plan: "pro" });

    await service.save(
      USER,
      { config: config("standard"), logoAction: "replace" },
      0,
      FILE,
    );

    expect(assets.stage).toHaveBeenCalled();
  });
});

describe("document presets and the plan", () => {
  const draft = {
    name: "Wholesale",
    config: config("standard"),
    logoAction: "keep" as const,
  };

  it.each([
    ["free", 0, 0],
    ["pro", 3, 3],
    ["business", 20, 20],
  ] as const)(
    "refuses a new preset on %s once %i are saved",
    async (plan, presetCount, limit) => {
      const { service } = setup({ plan, presetCount });

      await expect(service.savePreset(USER, draft)).rejects.toMatchObject({
        errorCode: "PRESET_LIMIT_EXCEEDED",
        statusCode: 402,
        details: { limit },
      });
    },
  );

  it("saves a preset below the limit", async () => {
    const { service, manager } = setup({ plan: "pro", presetCount: 2 });

    await expect(service.savePreset(USER, draft)).resolves.toMatchObject({
      name: "Wholesale",
    });
    expect(manager.save).toHaveBeenCalled();
  });
});
