import { ThrottlerModule } from "@nestjs/throttler";
/** Isolated production Nest controllers/services with in-memory DB + object storage doubles.
 * No app module, dotenv, Redis, real S3, or default database connections are used. */
import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { randomUUID } from "crypto";
import { SettingsController } from "../src/modules/settings/settings.controller";
import { DocumentConfigController } from "../src/modules/settings/document-config.controller";
import { DocumentPreviewController } from "../src/modules/receipts/document-preview.controller";
import { ReceiptsController } from "../src/modules/receipts/receipts.controller";
import { PublicReceiptsController } from "../src/modules/receipts/public-receipts.controller";
import { SettingsService } from "../src/modules/settings/services/settings.service";
import { DocumentConfigService } from "../src/modules/settings/services/document-config.service";
import { DocumentAssetsService } from "../src/modules/settings/services/document-assets.service";
import {
  DocumentRenderService,
  sampleOrder,
} from "../src/modules/receipts/services/document-render.service";
import { ReceiptSnapshotService } from "../src/modules/receipts/services/receipt-snapshot.service";
import { DocumentArtifact } from "../src/modules/receipts/entities/document-artifact.entity";
import { DocumentAsset } from "../src/modules/settings/entities/document-asset.entity";
import { DocumentArtifactsService } from "../src/modules/receipts/services/document-artifacts.service";
import { ReceiptArtifactService } from "../src/modules/receipts/services/receipt-artifact.service";
import { TemplateService } from "../src/modules/receipts/services/template.service";
import { PlaywrightPdfGenerator } from "../src/modules/receipts/services/playwright-pdf-generator.service";
import { ReceiptsService } from "../src/modules/receipts/receipts.service";
import { ReceiptOutboxService } from "../src/modules/receipts/receipt-outbox.service";
import { PdfGeneratorService } from "../src/modules/receipts/services/pdf-generator.service";
import { LogoStorageService } from "../src/common/services/logo-storage.service";
import { PdfStorageService } from "../src/common/services/pdf-storage.service";
import { CacheService } from "../src/common/services/cache.service";
import { SubscriptionService } from "../src/modules/subscription/subscription.service";
import { JwtAuthGuard } from "../src/modules/users/guards/jwt-auth.guard";
import { TenantInterceptor } from "../src/common/tenancy/tenant.interceptor";
import { GlobalExceptionFilter } from "../src/common/filters/GlobalExceptionFilter";
import { UserSettings } from "../src/modules/settings/entities/user-settings.entity";
import { DocumentPreset } from "../src/modules/settings/entities/document-preset.entity";
import { Receipt } from "../src/modules/receipts/entities/receipt.entity";
import { Order } from "../src/modules/orders/entities/order.entity";
import { UserSubscription } from "../src/modules/subscription/entities/user-subscription.entity";
import { User } from "../src/modules/users/entities/user.entity";

type Row = Record<string, unknown>;
type Entity = { name: string };
export const TENANT = "11111111-1111-4111-8111-111111111111";
export const OTHER_TENANT = "22222222-2222-4222-8222-222222222222";
export const ORDER_ID = "33333333-3333-4333-8333-333333333333";
export class MemoryDatabase {
  tables = new Map<string, Row[]>();
  writes: string[] = [];
  queries: string[] = [];
  failCommit = false;
  private serial: Promise<unknown> = Promise.resolve();
  private counter = 0;
  rows(entity: Entity): Row[] {
    return this.tables.get(entity.name) || [];
  }
  private matches(row: Row, filter: Row = {}): boolean {
    return Object.entries(filter).every(([key, value]) =>
      value && typeof value === "object" && "_type" in value
        ? value._type === "isNull"
          ? row[key] == null
          : value._type === "moreThan"
            ? "_value" in value &&
              new Date(String(row[key])).getTime() >
                new Date(String(value._value)).getTime()
            : value._type === "not"
              ? "_value" in value && row[key] !== value._value
              : false
        : row[key] === value,
    );
  }
  repository(entity: Entity): Repository<never> {
    const repo = {
      create: (value: Row) => ({ ...value }),
      findOne: async (options: { where?: Row; select?: string[] }) => {
        const row = this.rows(entity).find((value) =>
          this.matches(value, options.where),
        );
        return row
          ? options.select
            ? Object.fromEntries(
                options.select.map((key) => [key, structuredClone(row[key])]),
              )
            : this.project(entity, row)
          : null;
      },
      findOneOrFail: async (options: { where?: Row }) => {
        const row = this.rows(entity).find((value) =>
          this.matches(value, options.where),
        );
        if (!row) throw new Error("Fixture row not found");
        return this.project(entity, row);
      },
      find: async (
        options: {
          where?: Row;
          take?: number;
          select?: string[];
          order?: Record<string, "ASC" | "DESC">;
        } = {},
      ) =>
        this.rows(entity)
          .filter((value) => this.matches(value, options.where))
          .sort((a, b) => {
            for (const [key, direction] of Object.entries(
              options.order || {},
            )) {
              const left = a[key] instanceof Date ? a[key].getTime() : a[key];
              const right = b[key] instanceof Date ? b[key].getTime() : b[key];
              if (left < right) return direction === "ASC" ? -1 : 1;
              if (left > right) return direction === "ASC" ? 1 : -1;
            }
            return 0;
          })
          .slice(0, options.take)
          .map((value) =>
            options.select
              ? Object.fromEntries(
                  (Array.isArray(options.select)
                    ? options.select
                    : Object.keys(options.select).filter(
                        (key) => options.select[key],
                      )
                  ).map((key) => [key, structuredClone(value[key])]),
                )
              : this.project(entity, value),
          ),
      findAndCount: async (options: { where?: Row } = {}) => {
        const rows = this.rows(entity).filter((value) =>
          this.matches(value, options.where),
        );
        return [rows.map((value) => this.project(entity, value)), rows.length];
      },
      count: async (options: { where?: Row } = {}) =>
        this.rows(entity).filter((value) => this.matches(value, options.where))
          .length,
      save: async (value: Row) => {
        const id = value.id || randomUUID(),
          now = new Date();
        const saved = {
          created_at: now,
          createdAt: now,
          active_revision: 0,
          document_config_revision: 0,
          ...value,
          id,
          updated_at: now,
        };
        this.tables.set(entity.name, [
          ...this.rows(entity).filter((row) => row.id !== id),
          structuredClone(saved),
        ]);
        this.writes.push(`save:${entity.name}`);
        return structuredClone(saved);
      },
      update: async (filter: Row, patch: Row) => {
        const found = this.rows(entity).filter((value) =>
          this.matches(value, filter),
        );
        this.tables.set(
          entity.name,
          this.rows(entity).map((row) =>
            this.matches(row, filter)
              ? { ...row, ...structuredClone(patch) }
              : row,
          ),
        );
        this.writes.push(`update:${entity.name}`);
        return { affected: found.length };
      },
      delete: async (filter: Row | string[]) => {
        this.tables.set(
          entity.name,
          this.rows(entity).filter((row) =>
            Array.isArray(filter)
              ? !filter.includes(String(row.id))
              : !this.matches(row, filter),
          ),
        );
        this.writes.push(`delete:${entity.name}`);
      },
      createQueryBuilder: () => {
        let params: Row = {};
        const qb = {
          addSelect: () => qb,
          where: (_sql: string, values: Row) => {
            params = values;
            return qb;
          },
          getOne: async () => {
            const row = this.rows(entity).find(
              (value) =>
                (!params.id || value.id === params.id) &&
                (!params.userId ||
                  (value.user_id || value.userId) === params.userId) &&
                (!params.token || value.public_token === params.token) &&
                (!params.status || value.status === params.status),
            );
            return row ? structuredClone(row) : null;
          },
        };
        return qb;
      },
    };
    return repo as unknown as Repository<never>;
  }
  project(entity: Entity, row: Row): Row {
    const value = structuredClone(row);
    if (entity === Receipt)
      for (const key of [
        "html_snapshot",
        "active_snapshot",
        "pending_snapshot",
        "pending_html",
        "pending_id",
        "pending_expected_revision",
        "active_logo_asset_id",
        "pending_logo_asset_id",
      ])
        delete value[key];
    if (entity === DocumentPreset) delete value.config;
    return value;
  }
  manager = {
    getRepository: (entity: Entity) => this.repository(entity),
    create: (entity: Entity, value: Row) =>
      this.repository(entity).create(value as never),
    findOne: (entity: Entity, options: { where?: Row }) =>
      this.repository(entity).findOne(options as never),
    findOneOrFail: (entity: Entity, options: { where?: Row }) =>
      this.repository(entity).findOneOrFail(options as never),
    find: (entity: Entity, options: { where?: Row }) =>
      this.repository(entity).find(options as never),
    count: (entity: Entity, options: { where?: Row }) =>
      this.repository(entity).count(options as never),
    save: (entity: Entity, value: Row) =>
      this.repository(entity).save(value as never),
    update: (entity: Entity, filter: Row, value: Row) =>
      this.repository(entity).update(filter as never, value as never),
    delete: (entity: Entity, filter: Row) =>
      this.repository(entity).delete(filter as never),
    query: async (sql: string, params: unknown[] = []) => {
      this.queries.push(sql);
      if (/generate_receipt_number/.test(sql))
        return [{ receipt_number: `2026-${++this.counter}` }];
      const userId = String(params[0]);
      const logoUsed = (id: unknown) =>
        this.rows(UserSettings).some(
          (r) => r.userId === userId && r.logo_asset_id === id,
        ) ||
        this.rows(DocumentPreset).some(
          (r) => r.user_id === userId && r.logo_asset_id === id,
        ) ||
        this.rows(Receipt).some(
          (r) =>
            r.user_id === userId &&
            (r.active_logo_asset_id === id || r.pending_logo_asset_id === id),
        );
      const pdfUsed = (path: unknown) =>
        this.rows(Receipt).some(
          (r) => r.user_id === userId && r.pdf_path === path,
        );
      if (/AS used/.test(sql))
        return [
          {
            used: /document_presets/.test(sql)
              ? logoUsed(params[1])
              : pdfUsed(params[1]),
          },
        ];
      if (/SELECT a.\* FROM document_(assets|artifacts)/.test(sql)) {
        const logo = /FROM document_assets/.test(sql);
        return this.rows(logo ? DocumentAsset : DocumentArtifact)
          .filter(
            (r) =>
              r.user_id === userId &&
              new Date(String(r.lease_expires_at)).getTime() < Date.now() &&
              !(logo
                ? logoUsed(r.id)
                : pdfUsed("object-storage://" + r.object_key)),
          )
          .sort(
            (a, b) =>
              new Date(String(a.lease_expires_at)).getTime() -
              new Date(String(b.lease_expires_at)).getTime(),
          )
          .slice(0, 25)
          .map((r) => structuredClone(r));
      }
      if (/INSERT INTO document_artifacts/.test(sql)) {
        const [id, tenant, key] = params.map(String);
        const old = this.rows(DocumentArtifact).find(
          (r) => r.object_key === key,
        );
        if (!old)
          await this.manager.save(DocumentArtifact, {
            id,
            user_id: tenant,
            object_key: key,
            state: "ready",
            lease_expires_at: new Date(Date.now() + 86400000),
          });
        else if (old.state === "ready")
          await this.manager.update(
            DocumentArtifact,
            { id: old.id, user_id: tenant },
            { lease_expires_at: new Date(Date.now() + 86400000) },
          );
      }
      return [];
    },
  } as unknown as EntityManager;
  asDataSource(): DataSource {
    return {
      manager: this.manager,
      getRepository: (entity: Entity) => this.repository(entity),
      transaction: <T>(operation: (manager: EntityManager) => Promise<T>) => {
        const result = this.serial.then(async () => {
          const snapshot = structuredClone(this.tables);
          try {
            const value = await operation(this.manager);
            if (this.failCommit) throw new Error("Synthetic DB commit failure");
            return value;
          } catch (error) {
            this.tables = snapshot;
            throw error;
          }
        });
        this.serial = result.catch(() => undefined);
        return result;
      },
    } as unknown as DataSource;
  }
}
export async function createTemplateFixture(
  realPdf = false,
  initialize = true,
) {
  const memory = new MemoryDatabase(),
    db = memory.asDataSource(),
    objects = new Map<string, Buffer>();
  const failures = { upload: false, render: false, previewDelay: 0 };
  const cache = {
    get: async () => null,
    set: async () => undefined,
    del: async () => undefined,
  } as unknown as CacheService;
  const config = new ConfigService({
    LOGOS_BUCKET: "synthetic",
    RECEIPTS_BUCKET: "synthetic",
    S3_ENDPOINT: "http://unused.invalid",
    FRONTEND_URL: "http://127.0.0.1:4327",
  });
  const logos = new LogoStorageService(config),
    pdfs = new PdfStorageService(config);
  logos.uploadFile = async (_bucket, key, bytes) => {
    if (failures.upload) throw new Error("Synthetic logo upload failure");
    objects.set(key, bytes);
    return `synthetic://${key}`;
  };
  logos.downloadFile = async (_bucket, key) => {
    const bytes = objects.get(key);
    if (!bytes) throw new Error("Synthetic object missing");
    return bytes;
  };
  logos.fileExists = async (_bucket, key) => objects.has(key);
  logos.deleteFile = async (_bucket, key) => {
    objects.delete(key);
  };
  pdfs.uploadFile = logos.uploadFile;
  pdfs.downloadFile = logos.downloadFile;
  pdfs.fileExists = logos.fileExists;
  pdfs.deleteFile = logos.deleteFile;
  const renderer = new PlaywrightPdfGenerator();
  const actualRender = renderer.generatePdf.bind(renderer);
  renderer.generatePdf = async (html, options) => {
    if (failures.previewDelay)
      await new Promise((resolve) =>
        setTimeout(resolve, failures.previewDelay),
      );
    if (failures.render) throw new Error("Synthetic render failure");
    return realPdf
      ? actualRender(html, options)
      : Buffer.from("%PDF synthetic unit test bytes");
  };
  const assets = new DocumentAssetsService(db, logos),
    documents = new DocumentConfigService(db, assets, cache);
  const templates = new TemplateService();
  await templates.ready;
  const renders = new DocumentRenderService(templates, renderer, assets),
    snapshots = new ReceiptSnapshotService(db, documents, assets, renders),
    leases = new DocumentArtifactsService(db, pdfs),
    artifacts = new ReceiptArtifactService(db, snapshots, renders, leases);
  const settings = new SettingsService(
    db.getRepository(UserSettings),
    cache,
    documents,
  );
  const outbox = {
    dispatch: async () => undefined,
  } as unknown as ReceiptOutboxService;
  const receipts = new ReceiptsService(
    db.getRepository(Receipt),
    db.getRepository(Order),
    {} as PdfGeneratorService,
    pdfs,
    db,
    config,
    settings,
    outbox,
    snapshots,
    artifacts,
    documents,
    renders,
  );
  const subscription = {
    getAllowedTemplateIds: async () => null,
    assertCanUseTemplate: (userId: string, templateId: string) =>
      documents.assertTemplate(userId, templateId),
  };
  for (const userId of [TENANT, OTHER_TENANT]) {
    await db.manager.save(UserSubscription, {
      user_id: userId,
      plan: "business",
    });
    await db.manager.save(UserSettings, {
      userId,
      companyName: "Saved LLC",
      templateId: "standard",
      templateLanguage: "en",
      receiptTitle: "Saved invoice",
    });
    const order = {
      ...sampleOrder(userId),
      id: userId === TENANT ? ORDER_ID : randomUUID(),
      recipient_id: randomUUID(),
      is_locked: false,
      updated_at: new Date("2026-10-15T12:00:00Z"),
    };
    await db.manager.save(Order, order);
  }
  memory.writes = [];
  const module = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 10000 }])],
    controllers: [
      SettingsController,
      DocumentConfigController,
      DocumentPreviewController,
      ReceiptsController,
      PublicReceiptsController,
    ],
    providers: [
      { provide: ConfigService, useValue: config },
      { provide: LogoStorageService, useValue: logos },
      { provide: PdfStorageService, useValue: pdfs },
      { provide: SettingsService, useValue: settings },
      { provide: SubscriptionService, useValue: subscription },
      { provide: DocumentConfigService, useValue: documents },
      { provide: DocumentAssetsService, useValue: assets },
      { provide: DocumentRenderService, useValue: renders },
      { provide: ReceiptsService, useValue: receipts },
      { provide: getRepositoryToken(Order), useValue: db.getRepository(Order) },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate: (context: {
        switchToHttp: () => {
          getRequest: () => {
            headers: Record<string, string>;
            user?: { id: string };
          };
        };
      }) => {
        const req = context.switchToHttp().getRequest();
        req.user = {
          id:
            req.headers["x-fixture-tenant"] === OTHER_TENANT
              ? OTHER_TENANT
              : TENANT,
        };
        return true;
      },
    })
    .compile();
  const app = module.createNestApplication();
  app.useLogger(false);
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new TenantInterceptor());
  app.setGlobalPrefix("api/v1");
  if (initialize) await app.init();
  return {
    app,
    memory,
    db,
    objects,
    failures,
    renderer,
    templates,
    renders,
    assets,
    documents,
    snapshots,
    artifacts,
    leases,
    receipts,
    settings,
    logos,
    pdfs,
    tenant: TENANT,
    user: { id: TENANT } as User,
    close: async () => {
      await app.close();
      await renderer.cleanup();
    },
  };
}
