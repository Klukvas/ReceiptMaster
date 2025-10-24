import { Controller, Post, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { TemplateService, ReceiptTemplate } from '../services/template.service';
import { PlaywrightPdfGenerator } from '../services/playwright-pdf-generator.service';

@Controller('pdf-test')
export class PdfTestController {
  constructor(
    private templateService: TemplateService,
    private playwrightPdfGenerator: PlaywrightPdfGenerator,
  ) {}

  @Post('generate-test-pdf')
  async generateTestPdf(@Res() res: Response) {
    try {
      // Create test data
      const testData = {
        companyName: 'Test Company',
        hasCustomLogo: false,
        receiptNumber: 'TEST-001',
        orderDate: new Date().toLocaleString('ru-RU'),
        generatedAt: new Date().toLocaleString('ru-RU'),
        recipientName: 'Test Recipient',
        recipientEmail: 'test@example.com',
        recipientPhone: '+380123456789',
        recipientAddress: 'Test Address, 123',
        items: [
          {
            productName: 'Test Product 1',
            qty: 2,
            unitPrice: '100.00 ₴',
            lineTotal: '200.00 ₴'
          },
          {
            productName: 'Test Product 2',
            qty: 1,
            unitPrice: '150.00 ₴',
            lineTotal: '150.00 ₴'
          }
        ],
        subtotal: '350.00 ₴',
        total: '350.00 ₴',
        fontRegular: '',
        fontBold: ''
      };

      // Render HTML template
      const html = await this.templateService.renderTemplate(ReceiptTemplate.STANDARD, testData);
      
      // Generate PDF
      const pdfBuffer = await this.playwrightPdfGenerator.generatePdf(html);

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="test-receipt.pdf"');
      
      // Send PDF
      res.send(pdfBuffer);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}
