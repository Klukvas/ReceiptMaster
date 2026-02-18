import { Injectable, Logger } from "@nestjs/common";
import * as fs from "fs/promises";
import * as path from "path";
import * as Handlebars from "handlebars";
import { Order } from "../../orders/entities/order.entity";
import { MoneyUtil } from "../../../common/utils/money.util";

export interface TemplateData {
  // Company info
  companyName: string;
  companyAddress?: string;
  companyEmail?: string;
  companyPhone?: string;
  companyTaxId?: string;
  companyIban?: string;
  companySwift?: string;
  companyWebsite?: string;
  companyTagline?: string;
  hasCustomLogo: boolean;
  logoPath?: string;

  // Receipt info
  receiptTitle: string;
  receiptNumber: string;
  orderDate: string;
  generatedAt: string;

  // Recipient info
  recipientName: string;
  recipientEmail?: string;
  recipientPhone?: string;
  recipientAddress?: string;

  // Items
  items: Array<{
    productName: string;
    qty: number;
    unitPrice: string;
    lineTotal: string;
  }>;

  // Totals
  subtotal: string;
  total: string;

  // Fonts
  fontRegular: string;
  fontBold: string;

  // Translations
  translations: Record<string, string>;

  // Footer customization
  footerTitle?: string;
  footerSubtitle?: string;
}

export enum ReceiptTemplate {
  STANDARD = "standard",
  COMPACT = "compact",
  CLASSIC = "classic",
  MODERN = "modern",
  ELEGANT = "elegant",
  VINTAGE = "vintage",
  TECH = "tech",
  WAVE = "wave",
  MINIMAL = "minimal",
  CORPORATE = "corporate",
}

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);
  private templates: Map<string, HandlebarsTemplateDelegate> = new Map();
  private fonts: Map<string, string> = new Map();
  private translations: Map<string, Record<string, string>> = new Map();

  constructor() {
    this.registerHelpers();
    this.loadFonts();
    this.loadTranslations();
  }

  private registerHelpers() {
    // Register any custom Handlebars helpers here
    Handlebars.registerHelper(
      "formatCurrency",
      (cents: number, currency: string) => {
        return MoneyUtil.formatCentsToCurrency(cents, currency);
      },
    );

    Handlebars.registerHelper("add", (a: number, b: number) => {
      return a + b;
    });
  }

  private async loadFonts() {
    try {
      // Determine the correct path based on environment
      const isDevelopment = __dirname.includes("/src/");
      let fontsPath: string;

      if (isDevelopment) {
        fontsPath = path.join(__dirname, "../../../assets/fonts");
      } else {
        fontsPath = path.join(__dirname, "../../assets/fonts");
      }

      // Load regular font
      const regularFontPath = path.join(fontsPath, "NotoSans-Regular.ttf");
      const regularFontBuffer = await fs.readFile(regularFontPath);
      this.fonts.set("regular", regularFontBuffer.toString("base64"));

      // Load bold font
      const boldFontPath = path.join(fontsPath, "NotoSans_Condensed-Bold.ttf");
      const boldFontBuffer = await fs.readFile(boldFontPath);
      this.fonts.set("bold", boldFontBuffer.toString("base64"));

      this.logger.log("Fonts loaded successfully");
    } catch (error) {
      this.logger.error("Failed to load fonts:", error);
      // Continue without fonts - will fallback to system fonts
    }
  }

  private async loadTranslations() {
    try {
      const isDevelopment = __dirname.includes("/src/");
      let translationsPath: string;

      if (isDevelopment) {
        translationsPath = path.join(__dirname, "../templates/translations");
      } else {
        translationsPath = path.join(__dirname, "../../templates/translations");
      }

      const languages = ["en", "ru", "uk"];

      for (const lang of languages) {
        const translationPath = path.join(translationsPath, `${lang}.json`);
        const translationContent = await fs.readFile(translationPath, "utf-8");
        const translationData = JSON.parse(translationContent);
        this.translations.set(lang, translationData.corporate);
      }

      this.logger.log("Translations loaded successfully");
    } catch (error) {
      this.logger.error("Failed to load translations:", error);
      // Continue without translations - will use fallback
    }
  }

  async loadTemplate(
    templateName: ReceiptTemplate,
  ): Promise<HandlebarsTemplateDelegate> {
    const isDevelopment =
      __dirname.includes("/src/") || process.env.NODE_ENV !== "production";
    if (!isDevelopment && this.templates.has(templateName)) {
      return this.templates.get(templateName)!;
    }

    try {
      // Try multiple possible paths for template files
      const possiblePaths = [
        // Production path (dist)
        path.join(__dirname, `../templates/html/${templateName}-receipt.html`),
        // Development path (src)
        path.join(
          __dirname,
          `../../src/modules/receipts/templates/html/${templateName}-receipt.html`,
        ),
        // Alternative production path
        path.join(
          process.cwd(),
          `dist/modules/receipts/templates/html/${templateName}-receipt.html`,
        ),
        // Alternative development path
        path.join(
          process.cwd(),
          `src/modules/receipts/templates/html/${templateName}-receipt.html`,
        ),
      ];

      let templatePath: string | null = null;

      // Try each path until we find the template
      for (const testPath of possiblePaths) {
        try {
          await fs.access(testPath);
          templatePath = testPath;
          break;
        } catch {
          // Continue to next path
        }
      }

      if (!templatePath) {
        throw new Error(
          `Template file not found in any of the expected locations`,
        );
      }

      this.logger.log(`Loading template from: ${templatePath}`);
      const templateContent = await fs.readFile(templatePath, "utf-8");
      const compiledTemplate = Handlebars.compile(templateContent);

      if (!isDevelopment) {
        this.templates.set(templateName, compiledTemplate);
        this.logger.log(`Template ${templateName} loaded and cached`);
      } else {
        this.logger.log(`Template ${templateName} loaded (dev mode, no cache)`);
      }

      return compiledTemplate;
    } catch (error) {
      this.logger.error(`Failed to load template ${templateName}:`, error);
      throw new Error(`Template ${templateName} not found`);
    }
  }

  async renderTemplate(
    templateName: ReceiptTemplate,
    data: TemplateData,
  ): Promise<string> {
    const template = await this.loadTemplate(templateName);
    return template(data);
  }

  prepareTemplateData(
    order: Order,
    receiptNumber: string,
    companyInfo: {
      companyName: string;
      companyAddress?: string;
      companyEmail?: string;
      companyPhone?: string;
      companyTaxId?: string;
      companyIban?: string;
      companySwift?: string;
      companyWebsite?: string;
      companyTagline?: string;
    },
    hasCustomLogo: boolean = false,
    logoPath?: string,
    receiptTitle: string = "Invoice",
    language: string = "en",
    footerTitle?: string,
    footerSubtitle?: string,
  ): TemplateData {
    const formatCurrency = (cents: number) =>
      MoneyUtil.formatCentsToCurrency(cents, order.currency);

    // Get translations for the specified language, fallback to English
    const translations =
      this.translations.get(language) || this.translations.get("en") || {};

    return {
      companyName: companyInfo.companyName || "",
      companyAddress: companyInfo.companyAddress,
      companyEmail: companyInfo.companyEmail,
      companyPhone: companyInfo.companyPhone,
      companyTaxId: companyInfo.companyTaxId,
      companyIban: companyInfo.companyIban,
      companySwift: companyInfo.companySwift,
      companyWebsite: companyInfo.companyWebsite,
      companyTagline: companyInfo.companyTagline,
      hasCustomLogo,
      logoPath,
      receiptTitle,
      receiptNumber,
      orderDate: new Date(order.created_at).toLocaleString("ru-RU"),
      generatedAt: new Date().toLocaleString("ru-RU"),
      recipientName: order.recipient.name,
      recipientEmail: order.recipient.email || undefined,
      recipientPhone: order.recipient.phone || undefined,
      recipientAddress: order.recipient.address || undefined,
      items: order.items.map((item) => ({
        productName: item.product_name,
        qty: item.qty,
        unitPrice: formatCurrency(item.unit_price_cents),
        lineTotal: formatCurrency(item.line_total_cents),
      })),
      subtotal: formatCurrency(order.subtotal_cents),
      total: formatCurrency(order.total_cents),
      fontRegular: this.fonts.get("regular") || "",
      fontBold: this.fonts.get("bold") || "",
      translations,
      footerTitle,
      footerSubtitle,
    };
  }
}
