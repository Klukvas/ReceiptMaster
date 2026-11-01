import { HttpException, Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import { Order, OrderStatus } from "../../orders/entities/order.entity";
import { DocumentConfig, DocumentDraft } from "../../settings/document-config";
import { DocumentAssetsService } from "../../settings/services/document-assets.service";
import { TemplateService, ReceiptTemplate } from "./template.service";
import {
  PlaywrightPdfGenerator,
  PdfOptions,
} from "./playwright-pdf-generator.service";
import {
  getTemplateCapabilities,
  getTemplateMetadata,
} from "../templates/metadata";
import {
  formatDocumentDate,
  formatDocumentMoney,
} from "../../../common/utils/document-formatting.util";
import { resolveReceiptTitle } from "../templates/translations/defaults";

export type FrozenOrder = {
  id: string;
  currency: string;
  subtotal_cents: number;
  total_cents: number;
  created_at: string;
  recipient: { name: string; address?: string; email?: string; phone?: string };
  items: Array<{
    product_name: string;
    qty: number;
    unit_price_cents: number;
    line_total_cents: number;
  }>;
};
export type PublicProjection = {
  order: Omit<FrozenOrder, "subtotal_cents" | "total_cents" | "items"> & {
    subtotal_cents?: number;
    total_cents?: number;
    items: Array<{
      product_name: string;
      qty: number;
      unit_price_cents?: number;
      line_total_cents?: number;
    }>;
  };
  companyInfo: Record<string, string>;
  formatting: DocumentConfig["formatting"];
  documentLanguage: string;
  money: boolean;
};
export type RenderSnapshot = {
  config: DocumentConfig;
  order: FrozenOrder;
  capturedAt: string;
  templateRevision: number;
  options: PdfOptions;
  htmlHash: string;
  publicProjection: PublicProjection;
  sourceRevision: number;
  sourcePreset?: { id: string; revision: number };
  reconstructed?: boolean;
};
export function captureOrder(order: Order): FrozenOrder {
  return {
    id: order.id,
    currency: order.currency,
    subtotal_cents: order.subtotal_cents,
    total_cents: order.total_cents,
    created_at: new Date(order.created_at).toISOString(),
    recipient: {
      name: order.recipient.name,
      email: order.recipient.email || undefined,
      phone: order.recipient.phone || undefined,
      address: order.recipient.address || undefined,
    },
    items: order.items.map((item) => ({
      product_name: item.product_name,
      qty: item.qty,
      unit_price_cents: item.unit_price_cents,
      line_total_cents: item.line_total_cents,
    })),
  };
}
export function orderFingerprint(order: Order): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        ...captureOrder(order),
        items: captureOrder(order)
          .items.map((item) => JSON.stringify(item))
          .sort(),
        status: order.status,
        is_locked: order.is_locked,
        updated_at: order.updated_at,
      }),
    )
    .digest("hex");
}
export const completePdfOptions = (templateId: string): PdfOptions => ({
  format: "A4",
  margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
  printBackground: true,
  preferCSSPageSize: false,
  displayHeaderFooter: false,
  ...getTemplateMetadata(templateId)?.pdfOptions,
});
export function sampleOrder(userId: string): Order {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    user_id: userId,
    status: OrderStatus.CONFIRMED,
    currency: "UAH",
    subtotal_cents: 205050,
    total_cents: 205050,
    created_at: new Date("2026-10-15T12:00:00Z"),
    recipient: {
      name: "Alex Morgan",
      email: "alex@example.com",
      phone: "+380501234567",
      address: "Kyiv, 01001",
    },
    items: [
      {
        product_name: "Website development",
        qty: 1,
        unit_price_cents: 150050,
        line_total_cents: 150050,
      },
      {
        product_name: "Design consultation",
        qty: 2,
        unit_price_cents: 27500,
        line_total_cents: 55000,
      },
    ],
  } as Order;
}
@Injectable()
export class DocumentRenderService {
  private previewCount = 0;
  constructor(
    private readonly templates: TemplateService,
    private readonly renderer: PlaywrightPdfGenerator,
    private readonly assets: DocumentAssetsService,
  ) {}
  async prepare(
    userId: string,
    config: DocumentConfig,
    order: FrozenOrder,
    number: string,
    logo?: Buffer,
  ) {
    await this.templates.ready;
    const caps = getTemplateCapabilities(config.templateId);
    const visibleCompany = Object.fromEntries(
      Object.entries(config.company).map(([key, value]) => [
        key,
        caps.companyFields.includes(key) && config.visibility[key] !== false
          ? value
          : "",
      ]),
    ) as DocumentConfig["company"];
    const recipient: FrozenOrder["recipient"] = {
      name: order.recipient.name,
      ...Object.fromEntries(
        ["address", "email", "phone"].map((key) => [
          key,
          caps.recipientFields.includes(
            `recipient${key[0].toUpperCase()}${key.slice(1)}`,
          ) &&
          config.visibility[
            `recipient${key[0].toUpperCase()}${key.slice(1)}`
          ] !== false
            ? order.recipient[key]
            : undefined,
        ]),
      ),
    };
    const title = resolveReceiptTitle(
      config.title.mode === "custom" ? config.title.text : null,
      config.templateId,
      config.documentLanguage,
    );
    const capturedAt = new Date().toISOString();
    const money = (cents: number) =>
      formatDocumentMoney(cents, order.currency, config.formatting);
    const data = this.templates.prepareTemplateData(
      {
        ...order,
        created_at: new Date(order.created_at),
        recipient,
      } as unknown as Order,
      number,
      visibleCompany,
      Boolean(config.logo.visible && logo),
      config.logo.visible && logo
        ? `data:image/png;base64,${logo.toString("base64")}`
        : undefined,
      title,
      config.documentLanguage,
      config.footerTitle,
      config.footerSubtitle,
      caps.accent ? config.primaryColor : undefined,
      caps.terms ? config.paymentTerms : undefined,
      caps.terms ? config.deliveryTerms : undefined,
      config.title.mode === "custom",
      config.formatting,
    );
    // Automatic mode keeps the original template/shared print CSS geometry.
    // Corporate's original inline cap outranks the shared 120px rule.
    const logoStyle =
      config.logo.size === "auto"
        ? config.templateId === "corporate"
          ? "max-height:80px !important;"
          : ""
        : `width:${Math.min(config.logo.size, caps.logo.maxWidth)}px !important;max-width:${caps.logo.maxWidth}px !important;max-height:${caps.logo.maxHeight}px !important;object-fit:contain;`;
    const logoSlotStyle =
      config.logo.alignment === "auto"
        ? "display:contents"
        : `display:flex;justify-content:${{ left: "flex-start", center: "center", right: "flex-end" }[config.logo.alignment]};width:${caps.logo.maxWidth}px;max-width:100%;flex:0 1 ${caps.logo.maxWidth}px`;
    const html = await this.templates.renderTemplate(
      config.templateId as ReceiptTemplate,
      {
        ...data,
        logoStyle,
        logoSlotStyle,
        recipientEmail: recipient.email,
        recipientPhone: recipient.phone,
        recipientAddress: recipient.address,
        orderDate: formatDocumentDate(
          order.created_at,
          config.documentLanguage,
          config.formatting,
        ),
        generatedAt: formatDocumentDate(
          capturedAt,
          config.documentLanguage,
          config.formatting,
        ),
        items: order.items.map((item) => ({
          productName: item.product_name,
          qty: item.qty,
          unitPrice: money(item.unit_price_cents),
          lineTotal: money(item.line_total_cents),
        })),
        subtotal: money(order.subtotal_cents),
        total: money(order.total_cents),
      },
    );
    const publicProjection: PublicProjection = {
      companyInfo: { ...visibleCompany, receiptTitle: title },
      order: {
        ...order,
        recipient,
        subtotal_cents: caps.money ? order.subtotal_cents : undefined,
        total_cents: caps.money ? order.total_cents : undefined,
        items: order.items.map((item) =>
          caps.money
            ? item
            : { product_name: item.product_name, qty: item.qty },
        ),
      },
      formatting: config.formatting,
      documentLanguage: config.documentLanguage,
      money: caps.money,
    };
    const snapshot: RenderSnapshot = {
      config,
      order,
      capturedAt,
      templateRevision: caps.revision,
      options: completePdfOptions(config.templateId),
      htmlHash: createHash("sha256").update(html).digest("hex"),
      publicProjection,
      sourceRevision: 0,
    };
    return { html, snapshot };
  }
  async preview(
    userId: string,
    draft: DocumentDraft,
    order: Order,
    file?: Express.Multer.File,
  ): Promise<Buffer> {
    if (this.previewCount >= 2)
      throw new HttpException("Preview busy; retry shortly", 429);
    this.previewCount++;
    try {
      const logo = await this.assets.preview(userId, draft, file);
      const { html, snapshot } = await this.prepare(
        userId,
        draft.config,
        captureOrder(order),
        "PREVIEW-0001",
        logo,
      );
      return await this.renderer.generatePdf(html, snapshot.options);
    } finally {
      this.previewCount--;
    }
  }
  async render(html: string, snapshot: RenderSnapshot): Promise<Buffer> {
    if (createHash("sha256").update(html).digest("hex") !== snapshot.htmlHash)
      throw new Error("Frozen HTML integrity check failed");
    return this.renderer.generatePdf(html, snapshot.options);
  }
}
