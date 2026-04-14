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
import { DEFAULT_RECEIPT_TITLE } from "../templates/translations/defaults";

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
      const testData = this.getTestData(withLogo === "true", validatedLanguage);
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

  private getTestData(withLogo: boolean = true, language: string = "en") {
    let logoData = {
      hasCustomLogo: false,
      logoPath: undefined,
    };

    if (withLogo) {
      // Create a simple SVG logo as base64
      const logoSvg = `
        <svg width="120" height="40" viewBox="0 0 120 40" xmlns="http://www.w3.org/2000/svg">
          <rect width="120" height="40" fill="#2563EB" rx="8"/>
          <text x="60" y="26" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="14" font-weight="bold">TECH</text>
        </svg>
      `;

      const logoSvgBase64 = Buffer.from(logoSvg).toString("base64");
      const logoDataUrl = `data:image/svg+xml;base64,${logoSvgBase64}`;

      logoData = {
        hasCustomLogo: true,
        logoPath: logoDataUrl,
      };
    }

    return {
      companyName: "Tech Solutions LLC",
      ...logoData,
      receiptTitle: DEFAULT_RECEIPT_TITLE[language] || DEFAULT_RECEIPT_TITLE.en,
      receiptNumber: "2025-000123",
      orderDate: new Date().toLocaleString(
        TemplateService.getLocaleForLanguage(language),
      ),
      generatedAt: new Date().toLocaleString(
        TemplateService.getLocaleForLanguage(language),
      ),
      recipientName: "Олександр Петренко",
      recipientEmail: "oleksandr.petrenko@example.com",
      recipientPhone: "+380501234567",
      recipientAddress: "вул. Хрещатик, 22, оф. 15, Київ, 01001",
      items: [
        {
          productName: "Веб-розробка сайту",
          qty: 1,
          unitPrice: "15,000.00 ₴",
          lineTotal: "15,000.00 ₴",
        },
        {
          productName: "Дизайн логотипу",
          qty: 1,
          unitPrice: "3,500.00 ₴",
          lineTotal: "3,500.00 ₴",
        },
        {
          productName: "Технічна підтримка (1 місяць)",
          qty: 1,
          unitPrice: "2,000.00 ₴",
          lineTotal: "2,000.00 ₴",
        },
      ],
      subtotal: "20,500.00 ₴",
      total: "20,500.00 ₴",
      fontRegular: "",
      fontBold: "",
      translations: this.getTranslations(language),
    };
  }

  private getTranslations(language: string) {
    // Fallback translations in case the service hasn't loaded them yet
    const fallbackTranslations: Record<string, Record<string, string>> = {
      en: {
        date: "Date:",
        invoiceDate: "Invoice Date:",
        invoiceNo: "Invoice No:",
        due: "Due",
        recipient: "Recipient:",
        email: "Email:",
        phone: "Phone:",
        address: "Address:",
        billTo: "Bill To",
        billedTo: "Billed To",
        from: "From",
        fromLabel: "From:",
        billToLabel: "Bill To:",
        item: "Item",
        description: "Description",
        productName: "Product Name",
        qty: "Qty",
        unit: "Unit",
        unitPrice: "Unit Price",
        price: "Price",
        rate: "Rate",
        tax: "Tax",
        amount: "Amount",
        subtotal: "Subtotal",
        subTotal: "Sub Total:",
        total: "Total",
        grandTotal: "Grand Total",
        invoiceTotal: "Invoice Total",
        summary: "Summary",
        discount: "Discount",
        shipping: "Shipping",
        notes: "Notes",
        terms: "Terms",
        paymentInfo: "Payment Info",
        payment: "Payment",
        scanToPay: "Scan to pay",
        thankYou: "Thank you for your purchase!",
        footerMessage: "If you have any questions, please contact us.",
        generatedAt: "Receipt generated:",
        note: "Note:",
        debitMemo: "Debit Memo",
        taxInvoice: "TAX INVOICE",
        original: "Original",
        srNo: "SrNo",
        gstinNo: "GSTIN No:",
        billAmount: "Bill Amount: Thirty Thousand Forty Four Only",
        centralTax: "Central Tax (9.00 %):",
        stateTax: "State Tax (9.00 %):",
        termsAndConditions: "Terms & Conditions:",
        terms1: "Goods once sold will not be taken back.",
        terms2:
          "Our risk and responsibility ceases as soon as the goods are delivered to the carrier.",
        forCompany: "For, {{companyName}}",
        authorisedSignatory: "(Authorised Signatory)",
        taxId: "Tax ID",
        iban: "IBAN",
        swift: "SWIFT",
      },
      ru: {
        date: "Дата:",
        invoiceDate: "Дата счета:",
        invoiceNo: "Номер счета:",
        due: "Срок",
        recipient: "Получатель:",
        email: "Email:",
        phone: "Телефон:",
        address: "Адрес:",
        billTo: "Получатель",
        billedTo: "Получатель",
        from: "Отправитель",
        fromLabel: "От:",
        billToLabel: "Кому:",
        item: "Товар",
        description: "Описание",
        productName: "Наименование товара",
        qty: "Кол-во",
        unit: "Ед.",
        unitPrice: "Цена за ед.",
        price: "Цена",
        rate: "Цена",
        tax: "Налог",
        amount: "Сумма",
        subtotal: "Промежуточный итог",
        subTotal: "Промежуточный итог:",
        total: "Итого",
        grandTotal: "Общий итог",
        invoiceTotal: "Сумма счета",
        summary: "Итоги",
        discount: "Скидка",
        shipping: "Доставка",
        notes: "Примечания",
        terms: "Условия",
        paymentInfo: "Информация об оплате",
        payment: "Оплата",
        scanToPay: "Сканируйте для оплаты",
        thankYou: "Спасибо за покупку!",
        footerMessage: "Если у вас есть вопросы, пожалуйста, свяжитесь с нами.",
        generatedAt: "Чек сгенерирован:",
        note: "Примечание:",
        debitMemo: "Дебетовая записка",
        taxInvoice: "НАЛОГОВАЯ НАКЛАДНАЯ",
        original: "Оригинал",
        srNo: "№",
        gstinNo: "Налоговый номер:",
        billAmount: "Сумма счета: Тридцать тысяч сорок четыре только",
        centralTax: "Центральный налог (9.00 %):",
        stateTax: "Государственный налог (9.00 %):",
        termsAndConditions: "Условия и положения:",
        terms1: "Товары после продажи не принимаются обратно.",
        terms2:
          "Наш риск и ответственность прекращаются, как только товары доставлены перевозчику.",
        forCompany: "За, {{companyName}}",
        authorisedSignatory: "(Уполномоченная подпись)",
        taxId: "Налоговый номер",
        iban: "IBAN",
        swift: "SWIFT",
      },
      uk: {
        date: "Дата:",
        invoiceDate: "Дата рахунку:",
        invoiceNo: "Номер рахунку:",
        due: "Термін",
        recipient: "Одержувач:",
        email: "Email:",
        phone: "Телефон:",
        address: "Адреса:",
        billTo: "Одержувач",
        billedTo: "Одержувач",
        from: "Відправник",
        fromLabel: "Від:",
        billToLabel: "Кому:",
        item: "Товар",
        description: "Опис",
        productName: "Назва товару",
        qty: "Кількість",
        unit: "Од.",
        unitPrice: "Ціна за од.",
        price: "Ціна",
        rate: "Ціна",
        tax: "Податок",
        amount: "Сума",
        subtotal: "Проміжний підсумок",
        subTotal: "Проміжний підсумок:",
        total: "Разом",
        grandTotal: "Загальний підсумок",
        invoiceTotal: "Сума рахунку",
        summary: "Підсумки",
        discount: "Знижка",
        shipping: "Доставка",
        notes: "Примітки",
        terms: "Умови",
        paymentInfo: "Інформація про оплату",
        payment: "Оплата",
        scanToPay: "Скануйте для оплати",
        thankYou: "Дякуємо за покупку!",
        footerMessage: "Якщо у вас є питання, будь ласка, зв'яжіться з нами.",
        generatedAt: "Чек згенеровано:",
        note: "Примітка:",
        debitMemo: "Дебетова записка",
        taxInvoice: "ПОДАТКОВА НАКЛАДНА",
        original: "Оригінал",
        srNo: "№",
        gstinNo: "Податковий номер:",
        billAmount: "Сума рахунку: Тридцять тисяч сорок чотири тільки",
        centralTax: "Центральний податок (9.00 %):",
        stateTax: "Державний податок (9.00 %):",
        termsAndConditions: "Умови та положення:",
        terms1: "Товари після продажу не приймаються назад.",
        terms2:
          "Наш ризик та відповідальність припиняються, як тільки товари доставлені перевізнику.",
        forCompany: "За, {{companyName}}",
        authorisedSignatory: "(Уповноважений підпис)",
        taxId: "Податковий номер",
        iban: "IBAN",
        swift: "SWIFT",
      },
    };

    return fallbackTranslations[language] || fallbackTranslations.en;
  }

  @Post("generate-test-pdf")
  async generateTestPdf(
    @Body() body: { template?: string; withLogo?: boolean; language?: string },
    @Res() res: Response,
  ) {
    try {
      const validatedTemplate = validateTemplate(body.template);
      const validatedLanguage = validateLanguage(body.language);
      const testData = this.getTestData(
        body.withLogo !== false,
        validatedLanguage,
      );

      // Render HTML template
      const html = await this.templateService.renderTemplate(
        validatedTemplate,
        testData,
      );

      // Generate PDF
      const pdfBuffer = await this.playwrightPdfGenerator.generatePdf(html);

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
