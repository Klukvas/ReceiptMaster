import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { pdf, Font } from '@react-pdf/renderer';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EnvConfig } from '../../../config/env.schema';
import { Order } from '../../orders/entities/order.entity';
import { PdfStorageService } from '../../../common/services/pdf-storage.service';
import { LogoStorageService } from '../../../common/services/logo-storage.service';
import { ApiErrors } from '../../../common/errors/ApiError';
import { StandardReceiptDocument, CompactReceiptDocument } from '../templates';

export enum ReceiptStyle {
  STANDARD = 'standard',
  COMPACT = 'compact'
}

// Determine the correct path for fonts based on environment
const getFontPath = (fontFile: string): string => {
  const isDevelopment = __dirname.includes('/src/');
  if (isDevelopment) {
    // In development, __dirname points to src/modules/receipts/services/
    // Need to go up to src/ and then to assets/fonts/
    return path.join(__dirname, '../../../assets/fonts', fontFile);
  } else {
    // In production, __dirname points to dist/modules/receipts/services/
    // Fonts are copied to dist/modules/assets/fonts during build
    return path.join(__dirname, '../../assets/fonts', fontFile);
  }
};

@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);

  constructor(
    private configService: ConfigService<EnvConfig>,
    private pdfStorageService: PdfStorageService,
    private logoStorageService: LogoStorageService,
  ) {}

  async generateReceiptPdf(
    order: Order, 
    receiptNumber: string, 
    companyName: string = '', 
    userId: string,
    style: ReceiptStyle = ReceiptStyle.STANDARD
  ): Promise<{ filePath: string; url: string }> {
    let logoPath: string | undefined;
    
    try {
      this.logger.log(`Starting ${style} PDF generation using @react-pdf/renderer...`);
      this.logger.log('Order ID:', order.id);
      this.logger.log('Receipt number:', receiptNumber);

      // Register fonts
      const regularFontPath = getFontPath('NotoSans-Regular.ttf');
      const boldFontPath = getFontPath('NotoSans_Condensed-Bold.ttf');
      
      // Check if font files exist
      try {
        await fs.access(regularFontPath);
        await fs.access(boldFontPath);
        this.logger.log(`Font files found: ${regularFontPath}, ${boldFontPath}`);
      } catch (error) {
        this.logger.error(`Font files not found: ${error.message}`);
        throw new Error(`Font files not found: ${error.message}`);
      }
      
      Font.register({
        family: 'NotoSans',
        fonts: [
          { src: regularFontPath, fontWeight: 'normal' },
          { src: boldFontPath, fontWeight: 'bold' },
        ],
      });

      // Check if user has custom logo in Object Storage
      let hasCustomLogo = false;
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
          
          // Convert to base64 for react-pdf
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

      // Generate PDF based on style
      const doc = style === ReceiptStyle.COMPACT 
        ? <CompactReceiptDocument order={order} receiptNumber={receiptNumber} hasCustomLogo={hasCustomLogo} companyName={companyName} logoPath={logoPath} />
        : <StandardReceiptDocument order={order} receiptNumber={receiptNumber} hasCustomLogo={hasCustomLogo} companyName={companyName} logoPath={logoPath} />;
      
      // Use toBlob() and convert to Buffer
      const pdfBlob = await pdf(doc).toBlob();
      const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());

      // Save to Object Storage
      this.logger.log(`Saving ${style} PDF to Object Storage...`);
      const url = await this.pdfStorageService.uploadReceipt(pdfBuffer, fileName, userId);
      const filePath = `object-storage://receipts/${userId}/${fileName}`;
      this.logger.log(`${style} PDF saved to Object Storage: ${url}`);

      // Validate PDF format
      const isPdf = pdfBuffer.subarray(0, 4).toString('ascii') === '%PDF';
      if (!isPdf) {
        this.logger.error(`Generated file is not a valid PDF`);
        throw ApiErrors.RECEIPT_GENERATION_FAILED(order.id);
      }
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
