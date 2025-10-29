import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../../../config/env.schema';
import { Order } from '../../orders/entities/order.entity';
import { PdfStorageService } from '../../../common/services/pdf-storage.service';
import { LogoStorageService } from '../../../common/services/logo-storage.service';
import { ApiErrors } from '../../../common/errors/ApiError';
import { TemplateService, ReceiptTemplate } from './template.service';
import { PlaywrightPdfGenerator } from './playwright-pdf-generator.service';

export enum ReceiptStyle {
  STANDARD = 'standard',
  COMPACT = 'compact',
  CLASSIC = 'classic',
  MODERN = 'modern',
  ELEGANT = 'elegant',
  VINTAGE = 'vintage',
  TECH = 'tech',
  WAVE = 'wave',
  MINIMAL = 'minimal'
}

@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);

  constructor(
    private configService: ConfigService<EnvConfig>,
    private pdfStorageService: PdfStorageService,
    private logoStorageService: LogoStorageService,
    private templateService: TemplateService,
    private playwrightPdfGenerator: PlaywrightPdfGenerator,
  ) {}

  private getTemplateName(style: ReceiptStyle): ReceiptTemplate {
    switch (style) {
      case ReceiptStyle.STANDARD:
        return ReceiptTemplate.STANDARD;
      case ReceiptStyle.COMPACT:
        return ReceiptTemplate.COMPACT;
      case ReceiptStyle.CLASSIC:
        return ReceiptTemplate.CLASSIC;
      case ReceiptStyle.MODERN:
        return ReceiptTemplate.MODERN;
      case ReceiptStyle.ELEGANT:
        return ReceiptTemplate.ELEGANT;
      case ReceiptStyle.VINTAGE:
        return ReceiptTemplate.VINTAGE;
      case ReceiptStyle.TECH:
        return ReceiptTemplate.TECH;
      case ReceiptStyle.WAVE:
        return ReceiptTemplate.WAVE;
      case ReceiptStyle.MINIMAL:
        return ReceiptTemplate.MINIMAL;
      default:
        return ReceiptTemplate.STANDARD;
    }
  }

  async generateReceiptPdf(
    order: Order, 
    receiptNumber: string, 
    companyName: string = '', 
    userId: string,
    style: ReceiptStyle = ReceiptStyle.STANDARD,
    receiptTitle: string = 'Invoice',
    language: string = 'en',
    footerTitle?: string,
    footerSubtitle?: string,
    headerTitle?: string
  ): Promise<{ filePath: string; url: string }> {
    try {
      this.logger.log(`Starting ${style} PDF generation using Playwright...`);
      this.logger.log('Order ID:', order.id);
      this.logger.log('Receipt number:', receiptNumber);

      // Check if user has custom logo in Object Storage
      let hasCustomLogo = false;
      let logoPath: string | undefined;
      
      try {
        hasCustomLogo = await this.logoStorageService.userHasLogo(userId);
        this.logger.log(`Logo check for user ${userId}: hasCustomLogo = ${hasCustomLogo}`);
        
        if (hasCustomLogo) {
          const logoBuffer = await this.logoStorageService.downloadLogo(userId);
          this.logger.log(`Custom logo found for user ${userId}, logo size: ${logoBuffer.length} bytes`);
          
          // Check file format by looking at magic bytes
          const magicBytes = logoBuffer.subarray(0, 8);
          this.logger.log(`Logo magic bytes: ${magicBytes.toString('hex')}`);
          
          // Determine MIME type based on magic bytes
          let mimeType = 'image/png'; // default
          if (magicBytes[0] === 0xFF && magicBytes[1] === 0xD8) {
            mimeType = 'image/jpeg';
          } else if (magicBytes[0] === 0x89 && magicBytes[1] === 0x50 && magicBytes[2] === 0x4E && magicBytes[3] === 0x47) {
            mimeType = 'image/png';
          } else if (magicBytes[0] === 0x47 && magicBytes[1] === 0x49 && magicBytes[2] === 0x46) {
            mimeType = 'image/gif';
          }
          
          this.logger.log(`Detected MIME type: ${mimeType}`);
          
          // Convert to base64 for HTML
          const base64String = logoBuffer.toString('base64');
          logoPath = `data:${mimeType};base64,${base64String}`;
          this.logger.log(`Logo converted to base64, length: ${logoPath.length}`);
        } else {
          this.logger.log(`No custom logo found for user ${userId}`);
        }
      } catch (error) {
        this.logger.log(`Error checking/loading logo for user ${userId}: ${error.message}`);
        // Continue without logo if there's an error
        hasCustomLogo = false;
        logoPath = undefined;
      }

      const fileName = `${style}-receipt-${receiptNumber}-${Date.now()}.pdf`;
      
      this.logger.log(`Generating ${style} PDF: ${fileName}`);

      // Prepare template data
      const templateData = this.templateService.prepareTemplateData(
        order,
        receiptNumber,
        companyName,
        hasCustomLogo,
        logoPath,
        receiptTitle,
        language,
        footerTitle,
        footerSubtitle,
        headerTitle
      );

      // Render HTML template
      const templateName = this.getTemplateName(style);
      const html = await this.templateService.renderTemplate(templateName, templateData);
      
      this.logger.log(`HTML template rendered for ${style} style`);

      // Generate PDF using Playwright
      const pdfBuffer = await this.playwrightPdfGenerator.generatePdf(html);
      
      this.logger.log(`${style} PDF buffer generated, size: ${pdfBuffer.length} bytes`);

      // Validate PDF buffer
      if (!pdfBuffer || pdfBuffer.length === 0) {
        this.logger.error(`Generated PDF buffer is empty or invalid`);
        throw ApiErrors.RECEIPT_GENERATION_FAILED(order.id);
      }

      // Check if it's a valid PDF by looking at the header
      const pdfHeader = pdfBuffer.subarray(0, 4).toString();
      if (pdfHeader !== '%PDF') {
        this.logger.error(`Generated buffer is not a valid PDF. Header: ${pdfHeader}`);
        throw ApiErrors.RECEIPT_GENERATION_FAILED(order.id);
      }

      this.logger.log(`${style} PDF buffer is valid`);

      // Store PDF in Object Storage
      const url = await this.pdfStorageService.uploadReceipt(pdfBuffer, fileName, userId);
      const filePath = `object-storage://receipts/${userId}/${fileName}`;
      
      this.logger.log(`${style} PDF file is valid and saved to Object Storage`);

      this.logger.log(`${style} PDF receipt generated: ${filePath}`);

      return { filePath, url };
    } catch (error) {
      this.logger.error(`Error during ${style} PDF generation:`, error);
      this.logger.error('Error details:', JSON.stringify(error, null, 2));
      throw error;
    }
  }
}