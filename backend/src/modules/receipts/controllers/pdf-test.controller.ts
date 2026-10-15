import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Query,
  UseGuards,
  BadRequestException,
  HttpException,
  Logger,
} from "@nestjs/common";
import { Response } from "express";
import { TemplateService, ReceiptTemplate } from "../services/template.service";
import { PlaywrightPdfGenerator } from "../services/playwright-pdf-generator.service";
import { JwtAuthGuard } from "../../users/guards/jwt-auth.guard";
import { getTemplateMetadata } from "../templates/metadata";
import { Order } from "../../orders/entities/order.entity";
import { OrderItem } from "../../orders/entities/order-item.entity";
import { Recipient } from "../../recipients/entities/recipient.entity";

const VALID_TEMPLATES = new Set(Object.values(ReceiptTemplate));
const VALID_LANGUAGES = new Set(["en", "ru", "uk"]);

function validateTemplate(value: string | undefined): ReceiptTemplate {
  const name = value || "standard";
  if (!VALID_TEMPLATES.has(name as ReceiptTemplate)) {
    throw new BadRequestException(
      `Invalid template: "${name}". Valid values: ${[...VALID_TEMPLATES].join(", ")}`,
    );
  }
  return name as ReceiptTemplate;
}

function validateLanguage(value: string | undefined): string {
  const lang = value || "en";
  if (!VALID_LANGUAGES.has(lang)) {
    throw new BadRequestException(
      `Invalid language: "${lang}". Valid values: ${[...VALID_LANGUAGES].join(", ")}`,
    );
  }
  return lang;
}

@Controller("pdf-test")
@UseGuards(JwtAuthGuard)
export class PdfTestController {
  private readonly logger = new Logger(PdfTestController.name);

  constructor(
    private templateService: TemplateService,
    private playwrightPdfGenerator: PlaywrightPdfGenerator,
  ) {}

  @Get("generate-test-pdf")
  async generateTestPdfGet(
    @Query("template") template: string,
    @Query("logo") withLogo: string,
    @Query("language") language: string,
    @Res() res: Response,
  ) {
    const validatedTemplate = validateTemplate(template);
    const validatedLanguage = validateLanguage(language);
    return this.generateTestPdf(
      {
        template: validatedTemplate,
        withLogo: withLogo === "true",
        language: validatedLanguage,
      },
      res,
    );
  }

  @Get("preview-template")
  async previewTemplate(
    @Query("template") template: string,
    @Query("logo") withLogo: string,
    @Query("language") language: string,
    @Res() res: Response,
  ) {
    try {
      const validatedTemplate = validateTemplate(template);
      const validatedLanguage = validateLanguage(language);
      const testData = await this.getTestData(
        withLogo === "true",
        validatedLanguage,
      );
      const html = await this.templateService.renderTemplate(
        validatedTemplate,
        testData,
      );

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error("Failed to preview template", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  private async getTestData(withLogo: boolean = true, language: string = "en") {
    await this.templateService.ready;
    const logoSvg =
      '<svg width="120" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="40" fill="#2563EB" rx="8"/><text x="60" y="26" text-anchor="middle" fill="white" font-family="Arial" font-size="14">TECH</text></svg>';
    const logoPath = withLogo
      ? `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`
      : undefined;
    const items = [
      { name: "Веб-розробка сайту", cents: 1500000 },
      { name: "Дизайн логотипу", cents: 350000 },
      { name: "Технічна підтримка (1 місяць)", cents: 200000 },
    ].map(({ name, cents }) =>
      Object.assign(new OrderItem(), {
        product_name: name,
        qty: 1,
        unit_price_cents: cents,
        line_total_cents: cents,
      }),
    );
    const order = Object.assign(new Order(), {
      currency: "UAH",
      created_at: new Date(),
      subtotal_cents: 2050000,
      total_cents: 2050000,
      items,
      recipient: Object.assign(new Recipient(), {
        name: "Олександр Петренко",
        email: "oleksandr.petrenko@example.com",
        phone: "+380501234567",
        address: "вул. Хрещатик, 22, оф. 15, Київ, 01001",
      }),
    });
    return this.templateService.prepareTemplateData(
      order,
      "2025-000123",
      { companyName: "Tech Solutions LLC" },
      withLogo,
      logoPath,
      undefined,
      language,
    );
  }

  @Post("generate-test-pdf")
  async generateTestPdf(
    @Body() body: { template?: string; withLogo?: boolean; language?: string },
    @Res() res: Response,
  ) {
    try {
      const validatedTemplate = validateTemplate(body.template);
      const validatedLanguage = validateLanguage(body.language);
      const testData = await this.getTestData(
        body.withLogo !== false,
        validatedLanguage,
      );

      // Render HTML template
      const html = await this.templateService.renderTemplate(
        validatedTemplate,
        testData,
      );

      // Generate PDF
      const pdfBuffer = await this.playwrightPdfGenerator.generatePdf(
        html,
        getTemplateMetadata(validatedTemplate)?.pdfOptions,
      );

      // Set response headers
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="test-receipt.pdf"',
      );

      // Send PDF
      res.send(pdfBuffer);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error("Failed to generate test PDF", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
