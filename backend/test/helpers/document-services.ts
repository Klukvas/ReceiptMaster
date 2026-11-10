import { randomUUID } from "crypto";
import { DataSource } from "typeorm";
import { CacheService } from "../../src/common/services/cache.service";
import { LogoStorageService } from "../../src/common/services/logo-storage.service";
import { OrdersService } from "../../src/modules/orders/orders.service";
import { Order } from "../../src/modules/orders/entities/order.entity";
import { OrderItem } from "../../src/modules/orders/entities/order-item.entity";
import { IdempotencyKey } from "../../src/modules/orders/entities/idempotency-key.entity";
import { Product } from "../../src/modules/products/entities/product.entity";
import { Recipient } from "../../src/modules/recipients/entities/recipient.entity";
import { SubscriptionService } from "../../src/modules/subscription/subscription.service";
import { UserSubscription } from "../../src/modules/subscription/entities/user-subscription.entity";
import { SettingsService } from "../../src/modules/settings/services/settings.service";
import { DocumentAssetsService } from "../../src/modules/settings/services/document-assets.service";
import { DocumentConfigService } from "../../src/modules/settings/services/document-config.service";
import { DocumentSignoffService } from "../../src/modules/settings/services/document-signoff.service";
import { DocumentNumberingService } from "../../src/modules/receipts/document-numbering.service";
import { Receipt } from "../../src/modules/receipts/entities/receipt.entity";
import { ReceiptsService } from "../../src/modules/receipts/receipts.service";
import { ReceiptArtifactService } from "../../src/modules/receipts/services/receipt-artifact.service";
import { ReceiptSnapshotService } from "../../src/modules/receipts/services/receipt-snapshot.service";
import { DocumentRenderService } from "../../src/modules/receipts/services/document-render.service";
import { DocumentArtifactsService } from "../../src/modules/receipts/services/document-artifacts.service";
import { TemplateService } from "../../src/modules/receipts/services/template.service";

export const FIXTURE_PDF = Buffer.from("%PDF-1.4 document fixture");

/** The private logo bucket as a map; failures can be injected per key prefix. */
export class MemoryImmutableStorage {
  readonly objects = new Map<string, Buffer>();
  failUploads = false;

  userHasLogo = async () => false;

  uploadImmutable = async (
    png: Buffer,
    userId: string,
    assetId: string,
    prefix: "logos" | "signoffs" = "logos",
  ) => {
    if (this.failUploads) throw new Error("storage unavailable");
    const key = `${prefix}/${userId}/${assetId}.png`;
    this.objects.set(key, png);
    return key;
  };

  readImmutable = async (key: string) => {
    const bytes = this.objects.get(key);
    if (!bytes) throw new Error(`missing object ${key}`);
    return bytes;
  };

  removeImmutable = async (key: string) => {
    this.objects.delete(key);
  };

  keysFor(prefix: "logos" | "signoffs", userId: string): string[] {
    return [...this.objects.keys()].filter((key) =>
      key.startsWith(`${prefix}/${userId}/`),
    );
  }
}

/**
 * The real order, settings, snapshot, receipt and numbering services on a migrated
 * database. Chromium and object storage are doubles; `renderedHtml` records what the
 * renderer was asked to print.
 */
export function buildDocumentServices(app: DataSource) {
  const storage = new MemoryImmutableStorage();
  const renderedHtml: string[] = [];
  const renderer = {
    generatePdf: async (html: string) => {
      renderedHtml.push(html);
      return FIXTURE_PDF;
    },
  };
  const pdfStorage = {
    uploadReceipt: async (_buffer: Buffer, filename: string) =>
      `https://storage.example.test/${filename}-${randomUUID()}`,
    parseObjectStoragePath: (path: string) => ({
      bucket: "receipts",
      key: path.replace("object-storage://", ""),
    }),
    fileExists: async () => true,
  };
  const assets = new DocumentAssetsService(
    app,
    storage as unknown as LogoStorageService,
  );
  const configs = new DocumentConfigService(app, assets, {
    del: async () => undefined,
  } as unknown as CacheService);
  const signoffs = new DocumentSignoffService(app, assets, configs);
  const renders = new DocumentRenderService(
    new TemplateService(),
    renderer as never,
    assets,
    signoffs,
  );
  const snapshots = new ReceiptSnapshotService(
    app,
    configs,
    assets,
    renders,
    signoffs,
  );
  const artifacts = new ReceiptArtifactService(
    app,
    snapshots,
    renders,
    new DocumentArtifactsService(app, pdfStorage as never),
  );
  const receipts = new ReceiptsService(
    app.getRepository(Receipt),
    pdfStorage as never,
    app,
    { get: () => "https://example.test" } as never,
    { dispatch: async () => undefined } as never,
    snapshots,
    artifacts,
    configs,
    renders,
  );
  const subscription = new SubscriptionService(
    app.getRepository(UserSubscription),
    app.getRepository(Product),
    app.getRepository(Order),
    app,
  );
  const orders = new OrdersService(
    app.getRepository(Order),
    app.getRepository(OrderItem),
    app.getRepository(IdempotencyKey),
    app.getRepository(Product),
    app.getRepository(Recipient),
    app,
    receipts,
    { delByPattern: async () => undefined } as unknown as CacheService,
    subscription,
    { getAutoGenerateReceipt: async () => false } as unknown as SettingsService,
  );
  return {
    storage,
    renderedHtml,
    assets,
    configs,
    signoffs,
    snapshots,
    artifacts,
    receipts,
    orders,
    numbering: new DocumentNumberingService(app),
  };
}
