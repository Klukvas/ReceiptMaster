import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { SettingsService } from "../../settings/services/settings.service";
import { UserSettings } from "../../settings/entities/user-settings.entity";
import { CacheService } from "../../../common/services/cache.service";
import { PdfStorageService } from "../../../common/services/pdf-storage.service";
import { LogoStorageService } from "../../../common/services/logo-storage.service";
import { PdfGeneratorService, ReceiptStyle } from "./pdf-generator.service";
import { PlaywrightPdfGenerator } from "./playwright-pdf-generator.service";
import { TemplateService } from "./template.service";
import { Order } from "../../orders/entities/order.entity";
import { Recipient } from "../../recipients/entities/recipient.entity";
import { DEFAULT_RECEIPT_TITLE } from "../templates/translations/defaults";

const cases = ["en", "ru", "uk"].flatMap((language) =>
  [ReceiptStyle.DELIVERY, ReceiptStyle.PROFORMA].flatMap((style) =>
    [null, "", "   ", DEFAULT_RECEIPT_TITLE[language], "Custom document"].map(
      (title) => ({
        language,
        style,
        title,
      }),
    ),
  ),
);

describe("Stored title -> PDF generation provenance", () => {
  const repository = { findOne: jest.fn() };
  const order = Object.assign(new Order(), {
    id: "order-1",
    currency: "UAH",
    created_at: new Date("2026-10-14T12:34:00Z"),
    subtotal_cents: 0,
    total_cents: 0,
    items: [],
    recipient: Object.assign(new Recipient(), { name: "Recipient" }),
  });
  let settingsService: SettingsService;
  let generator: PdfGeneratorService;
  let templateService: TemplateService;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SettingsService,
        TemplateService,
        PdfGeneratorService,
        { provide: getRepositoryToken(UserSettings), useValue: repository },
        {
          provide: CacheService,
          useValue: { get: jest.fn().mockResolvedValue(null), set: jest.fn() },
        },
        { provide: ConfigService, useValue: {} },
        {
          provide: PdfStorageService,
          useValue: {
            uploadReceipt: jest
              .fn()
              .mockResolvedValue("https://offline.example/receipt.pdf"),
          },
        },
        {
          provide: LogoStorageService,
          useValue: { userHasLogo: jest.fn().mockResolvedValue(false) },
        },
        {
          provide: PlaywrightPdfGenerator,
          useValue: {
            generatePdf: jest
              .fn()
              .mockResolvedValue(Buffer.from("%PDF-offline")),
          },
        },
      ],
    }).compile();
    settingsService = module.get(SettingsService);
    generator = module.get(PdfGeneratorService);
    templateService = module.get(TemplateService);
    await templateService.ready;
  });

  it.each(cases)(
    "$language $style with stored title $title",
    async ({ language, style, title }) => {
      repository.findOne.mockResolvedValue(
        Object.assign(new UserSettings(), {
          userId: "user-1",
          templateLanguage: language,
          templateId: style,
          receiptTitle: title,
        }),
      );
      const settings = await settingsService.getAllPdfSettings("user-1");
      const result = await generator.generateReceiptPdf(
        order,
        "TEST-123",
        settings.companyInfo,
        "user-1",
        style,
        settings.receiptTitle,
        settings.templateLanguage,
        settings.footerTitle,
        settings.footerSubtitle,
        settings.primaryColor,
        settings.paymentTerms,
        settings.deliveryTerms,
        settings.hasCustomReceiptTitle,
      );
      const translations = templateService.prepareTemplateData(
        order,
        "TEST-123",
        { companyName: "" },
        false,
        undefined,
        undefined,
        language,
      ).translations;
      const expected = title?.trim()
        ? title
        : translations[
            style === ReceiptStyle.DELIVERY ? "deliveryNote" : "proformaInvoice"
          ];
      expect(result.html).toContain(`>${expected}</div>`);
      expect(settings.hasCustomReceiptTitle).toBe(Boolean(title?.trim()));
    },
  );

  it("keeps the specialised default for legacy callers omitting provenance", async () => {
    const result = await generator.generateReceiptPdf(
      order,
      "TEST-123",
      { companyName: "" },
      "user-1",
      ReceiptStyle.DELIVERY,
    );
    expect(result.html).toContain(">Delivery Note</div>");
  });
});
