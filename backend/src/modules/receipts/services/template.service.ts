import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import { Order } from '../../orders/entities/order.entity';
import { MoneyUtil } from '../../../common/utils/money.util';

export interface TemplateData {
  // Company info
  companyName: string;
  hasCustomLogo: boolean;
  logoPath?: string;
  
  // Receipt info
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
}

export enum ReceiptTemplate {
  STANDARD = 'standard',
  COMPACT = 'compact'
}

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);
  private templates: Map<string, HandlebarsTemplateDelegate> = new Map();
  private fonts: Map<string, string> = new Map();

  constructor() {
    this.registerHelpers();
    this.loadFonts();
  }

  private registerHelpers() {
    // Register any custom Handlebars helpers here
    Handlebars.registerHelper('formatCurrency', (cents: number, currency: string) => {
      return MoneyUtil.formatCentsToCurrency(cents, currency);
    });
  }

  private async loadFonts() {
    try {
      // Determine the correct path based on environment
      const isDevelopment = __dirname.includes('/src/');
      let fontsPath: string;
      
      if (isDevelopment) {
        fontsPath = path.join(__dirname, '../../../assets/fonts');
      } else {
        fontsPath = path.join(__dirname, '../../assets/fonts');
      }
      
      // Load regular font
      const regularFontPath = path.join(fontsPath, 'NotoSans-Regular.ttf');
      const regularFontBuffer = await fs.readFile(regularFontPath);
      this.fonts.set('regular', regularFontBuffer.toString('base64'));
      
      // Load bold font
      const boldFontPath = path.join(fontsPath, 'NotoSans_Condensed-Bold.ttf');
      const boldFontBuffer = await fs.readFile(boldFontPath);
      this.fonts.set('bold', boldFontBuffer.toString('base64'));
      
      this.logger.log('Fonts loaded successfully');
    } catch (error) {
      this.logger.error('Failed to load fonts:', error);
      // Continue without fonts - will fallback to system fonts
    }
  }

  async loadTemplate(templateName: ReceiptTemplate): Promise<HandlebarsTemplateDelegate> {
    if (this.templates.has(templateName)) {
      return this.templates.get(templateName)!;
    }

    try {
      // Determine the correct path based on environment
      const isDevelopment = __dirname.includes('/src/');
      let templatePath: string;
      
      if (isDevelopment) {
        // In development, __dirname points to src/modules/receipts/services/
        templatePath = path.join(__dirname, `../templates/html/${templateName}-receipt.html`);
      } else {
        // In production, __dirname points to dist/modules/receipts/services/
        templatePath = path.join(__dirname, `../templates/html/${templateName}-receipt.html`);
      }
      
      this.logger.log(`Loading template from: ${templatePath}`);
      const templateContent = await fs.readFile(templatePath, 'utf-8');
      const compiledTemplate = Handlebars.compile(templateContent);
      
      this.templates.set(templateName, compiledTemplate);
      this.logger.log(`Template ${templateName} loaded successfully`);
      
      return compiledTemplate;
    } catch (error) {
      this.logger.error(`Failed to load template ${templateName}:`, error);
      throw new Error(`Template ${templateName} not found`);
    }
  }

  async renderTemplate(templateName: ReceiptTemplate, data: TemplateData): Promise<string> {
    const template = await this.loadTemplate(templateName);
    return template(data);
  }

  prepareTemplateData(
    order: Order,
    receiptNumber: string,
    companyName: string = '',
    hasCustomLogo: boolean = false,
    logoPath?: string
  ): TemplateData {
    const formatCurrency = (cents: number) => 
      MoneyUtil.formatCentsToCurrency(cents, order.currency);

    return {
      companyName,
      hasCustomLogo,
      logoPath,
      receiptNumber,
      orderDate: new Date(order.created_at).toLocaleString('ru-RU'),
      generatedAt: new Date().toLocaleString('ru-RU'),
      recipientName: order.recipient.name,
      recipientEmail: order.recipient.email || undefined,
      recipientPhone: order.recipient.phone || undefined,
      recipientAddress: order.recipient.address || undefined,
      items: order.items.map(item => ({
        productName: item.product_name,
        qty: item.qty,
        unitPrice: formatCurrency(item.unit_price_cents),
        lineTotal: formatCurrency(item.line_total_cents)
      })),
      subtotal: formatCurrency(order.subtotal_cents),
      total: formatCurrency(order.total_cents),
      fontRegular: this.fonts.get('regular') || '',
      fontBold: this.fonts.get('bold') || ''
    };
  }
}
