import { DocumentConfigService } from "./services/document-config.service";
import { DocumentAssetsService } from "./services/document-assets.service";
import { legacyConfig } from "./document-config";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import request = require("supertest");
import sharp = require("sharp");
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./services/settings.service";
import { LogoStorageService } from "../../common/services/logo-storage.service";
import { CacheService } from "../../common/services/cache.service";
import { UserSettings } from "./entities/user-settings.entity";
import { Repository, DataSource, QueryResult } from "typeorm";
import { SubscriptionService } from "../subscription/subscription.service";
import { JwtAuthGuard } from "../users/guards/jwt-auth.guard";
import { GlobalExceptionFilter } from "../../common/filters/GlobalExceptionFilter";
import { ApiErrors } from "../../common/errors/ApiError";

describe("settings real Nest HTTP / storage contract (isolated memory)", () => {
  let app: INestApplication;
  let row: Partial<UserSettings>;
  let object: Buffer | undefined;
  let failUpload: boolean;
  let plan: "free" | "pro";
  let logo: LogoStorageService;
  const company = {
    companyName: "Saved LLC",
    companyAddress: "Address",
    companyEmail: "saved@example.com",
    companyPhone: "+38050",
    companyTaxId: "VAT",
    companyIban: "IBAN",
    companySwift: "SWIFT",
    companyWebsite: "example.com",
    companyTagline: "Tagline",
  };
  beforeEach(async () => {
    row = { userId: "fixture", templateLanguage: "ru", ...company };
    object = undefined;
    failUpload = false;
    plan = "pro";
    const repo = {
      findOne: async () => ({ ...row }),
      findOneOrFail: async () => ({ ...row }),
      upsert: async (value: Partial<UserSettings>) => {
        row = { ...row, ...value };
      },
    };
    const cache = {
      get: async () => null,
      set: async () => {},
      del: async () => {},
    };
    const service = new SettingsService(
      repo as unknown as Repository<UserSettings>,
      cache as unknown as CacheService,
    );
    logo = new LogoStorageService(
      new ConfigService({
        LOGOS_BUCKET: "fixture",
        S3_ENDPOINT: "http://unused.invalid",
      }),
    );
    jest
      .spyOn(logo, "uploadFile")
      .mockImplementation(async (_bucket, key, buffer, mime) => {
        expect(key).toMatch(/^logos\/fixture\/[a-f0-9-]+\.png$/);
        expect(mime).toBe("image/png");
        if (failUpload) throw new Error("Synthetic storage failure");
        object = buffer;
        return "mock://fixture-logo";
      });
    jest.spyOn(logo, "downloadFile").mockImplementation(async () => {
      if (!object) throw new Error("Missing");
      return object;
    });
    jest.spyOn(logo, "deleteFile").mockImplementation(async () => {
      object = undefined;
    });
    const module = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [
        { provide: ConfigService, useValue: new ConfigService() },
        {
          provide: DocumentConfigService,
          useValue: {
            read: async () => ({
              config: legacyConfig(row as UserSettings),
              revision: 0,
            }),
            save: async (
              _userId: string,
              draft: { logoAction: string },
              _revision: number,
              file?: Express.Multer.File,
            ) => {
              if (draft.logoAction === "replace")
                await logo.uploadImmutable(
                  await logo.normalizeLogo(file.buffer, file.mimetype),
                  "fixture",
                  "11111111-1111-4111-8111-111111111111",
                );
              return { revision: 1 };
            },
          },
        },
        {
          provide: DocumentAssetsService,
          useValue: {
            preview: async () => {
              if (!object) return undefined;
              return logo.normalizeLogo(object);
            },
          },
        },
        { provide: SettingsService, useValue: service },
        { provide: LogoStorageService, useValue: logo },
        {
          provide: SubscriptionService,
          useValue: {
            assertCanUseTemplate: async (_user: string, id: string) => {
              if (plan === "free" && id === "branded")
                throw ApiErrors.TEMPLATE_PLAN_RESTRICTED(id);
            },
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context) => {
          context.switchToHttp().getRequest().user = { id: "fixture" };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useLogger(false);
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });
  it("returns the exact company envelope and preserves eight fields after a name-only HTTP save", async () => {
    expect(
      (
        await request(app.getHttpServer())
          .get("/settings/company-info")
          .expect(200)
      ).body,
    ).toEqual({ data: company });
    await request(app.getHttpServer())
      .post("/settings/company-info")
      .send({ companyName: "New LLC" })
      .expect(201);
    expect(
      (await request(app.getHttpServer()).get("/settings/company-info")).body
        .data,
    ).toEqual({ ...company, companyName: "New LLC" });
  });
  it.each([
    ["template", { templateId: "unknown" }],
    ["template", {}],
    ["template-language", { language: "xx" }],
    ["receipt-title", { title: 42 }],
    ["footer-title", {}],
    ["footer-subtitle", { footerSubtitle: [] }],
    ["payment-terms", {}],
    ["delivery-terms", { deliveryTerms: null }],
    ["company-info", {}],
    ["company-info", { companyEmail: "invalid" }],
    ["company-info", { companyName: 4 }],
    ["primary-color", { primaryColor: 123 }],
  ])("rejects invalid HTTP body for %s", async (endpoint, body) => {
    const before = { ...row };
    await request(app.getHttpServer())
      .post("/settings/" + endpoint)
      .send(body)
      .expect(400);
    expect(row).toEqual(before);
  });
  it("keeps free-plan entitlement enforcement after known-ID validation", async () => {
    plan = "free";
    await request(app.getHttpServer())
      .post("/settings/template")
      .send({ templateId: "branded" })
      .expect(402);
    await request(app.getHttpServer())
      .post("/settings/template")
      .send({ templateId: "unknown" })
      .expect(400);
    await request(app.getHttpServer())
      .post("/settings/template")
      .send({ templateId: "standard" })
      .expect(201);
  });
  it("validates both footer fields before its single write and allows optional blank resets", async () => {
    const before = { ...row };
    await request(app.getHttpServer())
      .post("/settings/footer")
      .send({ footerTitle: "new", footerSubtitle: 42 })
      .expect(400);
    expect(row).toEqual(before);
    await request(app.getHttpServer())
      .post("/settings/footer")
      .send({ footerTitle: "new", footerSubtitle: "sub" })
      .expect(201);
    expect(row).toMatchObject({ footerText: "new", subFooterText: "sub" });
    await request(app.getHttpServer())
      .post("/settings/company-info")
      .send({ companyEmail: "", companyWebsite: "" })
      .expect(201);
    await request(app.getHttpServer())
      .post("/settings/receipt-title")
      .send({ title: "" })
      .expect(201);
    expect(
      (await request(app.getHttpServer()).get("/settings/receipt-design")).body
        .data,
    ).toMatchObject({ receiptTitle: "Инвойс", hasCustomReceiptTitle: false });
  });
  it.each(["png", "jpeg", "gif", "svg"] as const)(
    "accepts %s multipart, stores and retrieves genuine PNG bytes",
    async (format) => {
      const source =
        format === "svg"
          ? Buffer.from(
              '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="12"><rect width="24" height="12" fill="red"/></svg>',
            )
          : await sharp({
              create: { width: 24, height: 12, channels: 3, background: "red" },
            })
              .toFormat(format)
              .toBuffer();
      const mime = {
        png: "image/png",
        jpeg: "image/jpeg",
        gif: "image/gif",
        svg: "image/svg+xml",
      }[format];
      await request(app.getHttpServer())
        .post("/settings/logo/upload")
        .attach("logo", source, {
          filename: "logo." + format,
          contentType: mime,
        })
        .expect(201);
      const response = await request(app.getHttpServer())
        .get("/settings/logo")
        .expect(200)
        .expect("Content-Type", /image\/png/);
      expect((await sharp(response.body).metadata()).format).toBe("png");
    },
  );
  it("rejects malformed/active SVG and preserves old bytes on failed replacement", async () => {
    const old = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer();
    object = old;
    await request(app.getHttpServer())
      .post("/settings/logo/upload")
      .attach(
        "logo",
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><script>alert(1)</script></svg>',
        ),
        { filename: "active.svg", contentType: "image/svg+xml" },
      )
      .expect(400);
    expect(object).toEqual(old);
    failUpload = true;
    await request(app.getHttpServer())
      .post("/settings/logo/upload")
      .attach("logo", old, { filename: "new.png", contentType: "image/png" })
      .expect(500);
    expect(object).toEqual(old);
    expect(logo.deleteFile).not.toHaveBeenCalled();
    const response = await request(app.getHttpServer())
      .get("/settings/logo")
      .expect(200);
    expect((await sharp(response.body).metadata()).format).toBe("png");
  });
});

it("actual TypeORM upsert SQL updates supplied columns only (no database connection)", async () => {
  const db = new DataSource({ type: "postgres", entities: [UserSettings] });
  await (
    db as unknown as { buildMetadatas: () => Promise<void> }
  ).buildMetadatas();
  const queries: string[] = [];
  const runner = {
    connection: db,
    manager: db.manager,
    isReleased: false,
    isTransactionActive: false,
    data: {},
    query: async (sql: string) => {
      queries.push(sql);
      const result = new QueryResult();
      result.records = [];
      result.raw = [];
      result.affected = 1;
      return result;
    },
    release: async () => {},
    connect: async () => {},
    broadcaster: {
      broadcast: async () => {},
      broadcastBeforeInsertEvent: () => {},
      broadcastAfterInsertEvent: () => {},
    },
  };
  jest
    .spyOn(db, "createQueryRunner")
    .mockReturnValue(
      runner as unknown as ReturnType<DataSource["createQueryRunner"]>,
    );
  await db
    .getRepository(UserSettings)
    .upsert({ userId: "fixture", footerText: "title" }, ["userId"]);
  const conflict =
    queries
      .find((sql) => sql.includes("ON CONFLICT"))
      ?.split("DO UPDATE SET")[1] || "";
  expect(conflict).toContain('"footerText" = EXCLUDED."footerText"');
  expect(conflict).not.toContain('"subFooterText" =');
  expect(conflict).not.toContain('"companyName" =');
});
