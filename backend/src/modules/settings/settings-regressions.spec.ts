import { SettingsController } from "./settings.controller";
import { SettingsService } from "./services/settings.service";
import { UserSettings } from "./entities/user-settings.entity";
import { Repository } from "typeorm";
import { CacheService } from "../../common/services/cache.service";
import { ConfigService } from "@nestjs/config";
import { LogoStorageService } from "../../common/services/logo-storage.service";
import { SubscriptionService } from "../subscription/subscription.service";
import { User } from "../users/entities/user.entity";

// An in-memory repository intentionally returns detached snapshots, as a real SELECT does.
function fixture() {
  let row = {
    id: "settings",
    userId: "user",
    footerText: "old",
    subFooterText: "old sub",
    templateId: "standard",
    templateLanguage: "ru",
    receiptTitle: null,
  } as UserSettings;
  const repository = {
    findOne: jest.fn(async () => ({ ...row })),
    create: jest.fn((value: Partial<UserSettings>) => value),
    save: jest.fn(async (value: Partial<UserSettings>) => {
      await Promise.resolve();
      row = { ...row, ...value };
      return { ...row };
    }),
    update: jest.fn(async (_where: unknown, value: Partial<UserSettings>) => {
      row = { ...row, ...value };
      return { affected: 1 };
    }),
    upsert: jest.fn(async (value: Partial<UserSettings>) => {
      row = { ...row, ...value };
    }),
  };
  const cache = {
    get: jest.fn(async () => null),
    set: jest.fn(),
    del: jest.fn(),
  };
  const service = new SettingsService(
    repository as unknown as Repository<UserSettings>,
    cache as unknown as CacheService,
  );
  const entitlement = { assertCanUseTemplate: jest.fn() };
  const logo = {
    uploadLogo: jest.fn(async () => {
      throw new Error("S3 unavailable");
    }),
    deleteUserLogo: jest.fn(),
  };
  const controller = new SettingsController(
    {} as ConfigService,
    logo as unknown as LogoStorageService,
    service,
    entitlement as unknown as SubscriptionService,
  );
  return {
    controller,
    service,
    repository,
    entitlement,
    logo,
    row: () => row,
    set: (value: Partial<UserSettings>) => {
      row = { ...row, ...value };
    },
  };
}
const req = { user: { id: "user" } as User };
describe("settings audit regressions", () => {
  it.each(["", "unknown", null, 123])(
    "rejects unknown template %p before entitlement or persistence",
    async (templateId) => {
      const f = fixture();
      await expect(
        f.controller.updateTemplateSettings(req, { templateId } as {
          templateId: string;
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(f.entitlement.assertCanUseTemplate).not.toHaveBeenCalled();
      expect(f.repository.save).not.toHaveBeenCalled();
    },
  );
  it.each(["xx", "", null, 42])(
    "rejects invalid language %p",
    async (language) => {
      await expect(
        fixture().controller.updateTemplateLanguage(req, { language } as {
          language: string;
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    },
  );
  it.each([{ title: 2 }, {}, { title: "x".repeat(201) }])(
    "rejects malformed title %p",
    async (body) => {
      await expect(
        fixture().controller.updateReceiptTitle(req, body as { title: string }),
      ).rejects.toMatchObject({ statusCode: 400 });
    },
  );
  it.each([
    { companyEmail: "invalid" },
    { companyWebsite: "javascript:alert(1)" },
    { companyName: 2 },
    { companyName: "x".repeat(201) },
  ])("rejects malformed company info %p", async (body) => {
    await expect(
      fixture().controller.updateCompanyInfo(
        req,
        body as { companyName: string },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
  it("preserves independent concurrent footer writes", async () => {
    const f = fixture();
    await Promise.all([
      f.service.setFooterTitle("user", "new"),
      f.service.setFooterSubtitle("user", "new sub"),
    ]);
    expect(f.row()).toMatchObject({
      footerText: "new",
      subFooterText: "new sub",
    });
  });
  it("preserves independent concurrent first-row settings upserts in memory", async () => {
    let row: Partial<UserSettings> | undefined;
    const repository = {
      upsert: jest.fn(async (patch: Partial<UserSettings>) => {
        row = { ...row, ...patch };
      }),
    };
    const service = new SettingsService(
      repository as unknown as Repository<UserSettings>,
      { del: jest.fn() } as unknown as CacheService,
    );
    await Promise.all([
      service.setFooterTitle("new-user", "title"),
      service.setFooterSubtitle("new-user", "subtitle"),
    ]);
    expect(row).toEqual({
      userId: "new-user",
      footerText: "title",
      subFooterText: "subtitle",
    });
  });
  it("uses the rendered Branded default color", async () => {
    expect(
      (await fixture().service.getReceiptDesignSettings("user")).primaryColor,
    ).toBe("#3B82F6");
  });
  it.each([
    ["delivery", "Накладная"],
    ["proforma", "Проформа-инвойс"],
  ])("shows localized automatic %s title", async (templateId, title) => {
    const f = fixture();
    f.set({ templateId });
    expect(
      (await f.service.getReceiptDesignSettings("user")).receiptTitle,
    ).toBe(title);
  });
  it("keeps the old logo when replacement upload fails", async () => {
    const f = fixture();
    await expect(
      f.controller.uploadLogo(
        {
          buffer: Buffer.from("image"),
          mimetype: "image/png",
        } as Express.Multer.File,
        req,
      ),
    ).rejects.toBeDefined();
    expect(f.logo.deleteUserLogo).not.toHaveBeenCalled();
  });
});
