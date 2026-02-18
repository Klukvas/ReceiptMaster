import { Controller, Post, Get, Body, Res, Query } from "@nestjs/common";
import { Response } from "express";
import { TemplateService, ReceiptTemplate } from "../services/template.service";
import { PlaywrightPdfGenerator } from "../services/playwright-pdf-generator.service";

@Controller("pdf-test")
export class PdfTestController {
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
    return this.generateTestPdf(
      { template, withLogo: withLogo === "true", language },
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
      const testData = this.getTestData(withLogo === "true", language || "en");
      const templateName = template || "standard";
      const templateEnum = templateName as ReceiptTemplate;
      const html = await this.templateService.renderTemplate(
        templateEnum,
        testData,
      );

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (error) {
      res.status(500).json({ error: error.message });
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
      receiptTitle: "Invoice",
      receiptNumber: "2025-000123",
      orderDate: new Date().toLocaleString("ru-RU"),
      generatedAt: new Date().toLocaleString("ru-RU"),
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
    const fallbackTranslations = {
      en: {
        debitMemo: "Debit Memo",
        taxInvoice: "TAX INVOICE",
        original: "Original",
        invoiceNo: "Invoice No :",
        date: "Date :",
        srNo: "SrNo",
        productName: "Product Name",
        qty: "Qty",
        rate: "Rate",
        amount: "Amount",
        subTotal: "Sub Total:",
        gstinNo: "GSTIN No:",
        billAmount: "Bill Amount: Thirty Thousand Forty Four Only",
        centralTax: "Central Tax (9.00 %):",
        stateTax: "State Tax (9.00 %):",
        grandTotal: "Grand Total",
        note: "Note:",
        termsAndConditions: "Terms & Conditions:",
        terms1: "Goods once sold will not be taken back.",
        terms2:
          "Our risk and responsibility ceases as soon as the goods are delivered to the carrier.",
        forCompany: "For, {{companyName}}",
        authorisedSignatory: "(Authorised Signatory)",
      },
      ru: {
        debitMemo: "Дебетовая записка",
        taxInvoice: "НАЛОГОВАЯ НАКЛАДНАЯ",
        original: "Оригинал",
        invoiceNo: "Номер счета :",
        date: "Дата :",
        srNo: "№",
        productName: "Наименование товара",
        qty: "Кол-во",
        rate: "Цена",
        amount: "Сумма",
        subTotal: "Промежуточный итог:",
        gstinNo: "Налоговый номер:",
        billAmount: "Сумма счета: Тридцать тысяч сорок четыре только",
        centralTax: "Центральный налог (9.00 %):",
        stateTax: "Государственный налог (9.00 %):",
        grandTotal: "Общий итог",
        note: "Примечание:",
        termsAndConditions: "Условия и положения:",
        terms1: "Товары после продажи не принимаются обратно.",
        terms2:
          "Наш риск и ответственность прекращаются, как только товары доставлены перевозчику.",
        forCompany: "За, {{companyName}}",
        authorisedSignatory: "(Уполномоченная подпись)",
      },
      uk: {
        debitMemo: "Дебетова записка",
        taxInvoice: "ПОДАТКОВА НАКЛАДНА",
        original: "Оригінал",
        invoiceNo: "Номер рахунку :",
        date: "Дата :",
        srNo: "№",
        productName: "Назва товару",
        qty: "Кількість",
        rate: "Ціна",
        amount: "Сума",
        subTotal: "Проміжний підсумок:",
        gstinNo: "Податковий номер:",
        billAmount: "Сума рахунку: Тридцять тисяч сорок чотири тільки",
        centralTax: "Центральний податок (9.00 %):",
        stateTax: "Державний податок (9.00 %):",
        grandTotal: "Загальний підсумок",
        note: "Примітка:",
        termsAndConditions: "Умови та положення:",
        terms1: "Товари після продажу не приймаються назад.",
        terms2:
          "Наш ризик та відповідальність припиняються, як тільки товари доставлені перевізнику.",
        forCompany: "За, {{companyName}}",
        authorisedSignatory: "(Уповноважений підпис)",
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
      const testData = this.getTestData(
        body.withLogo !== false,
        body.language || "en",
      );

      // Render HTML template
      const templateName = body.template || "standard";
      const template = templateName as ReceiptTemplate;
      const html = await this.templateService.renderTemplate(
        template,
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
      res.status(500).json({ error: error.message });
    }
  }
}
