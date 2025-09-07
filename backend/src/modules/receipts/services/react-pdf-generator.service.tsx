import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { pdf, Document, Page, Text, View, Font } from '@react-pdf/renderer';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EnvConfig } from '../../../config/env.schema';
import { Order } from '../../orders/entities/order.entity';
import { MoneyUtil } from '../../../common/utils/money.util';


// Determine the correct path for fonts based on environment
const getFontPath = (fontFile: string) => {
  const isDevelopment = __dirname.includes('/src/');
  if (isDevelopment) {
    // In development, __dirname points to src/modules/receipts/services/
    // Need to go up to src/ and then to assets/fonts/
    return path.join(__dirname, '../../../assets/fonts', fontFile);
  } else {
    // In production, __dirname points to dist/modules/receipts/services/
    return path.join(__dirname, '../../assets/fonts', fontFile);
  }
};

Font.register({
  family: 'NotoSans',
  fonts: [
    { src: getFontPath('NotoSans-Regular.ttf'), fontWeight: 'normal' },
    { src: getFontPath('NotoSans_Condensed-Bold.ttf'), fontWeight: 'bold' },
  ],
});

const ReceiptDocument = ({ order, receiptNumber }: { order: Order; receiptNumber: string }) => {
  const formatCurrency = (cents: number) => 
    MoneyUtil.formatCentsToCurrency(cents, order.currency);

  return (
    <Document>
      <Page 
        size="A4" 
        style={{ 
          padding: 40, 
          fontFamily: 'NotoSans',
          fontSize: 10,
          lineHeight: 1.4 
        }}
      >
        {/* Header */}
        <View 
          style={{ 
            textAlign: 'center', 
            borderBottom: '2 solid #000', 
            paddingBottom: 20, 
            marginBottom: 20 
          }}
        >
          <Text 
            style={{ 
              fontSize: 24, 
              fontWeight: 'bold', 
              marginBottom: 10 
            }}
          >
            ЧЕК
          </Text>
          <Text 
            style={{ 
              fontSize: 16, 
              color: '#666' 
            }}
          >
            № {receiptNumber}
          </Text>
        </View>

        {/* Order Info */}
        <View style={{ marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', marginBottom: 5 }}>
            <Text style={{ fontWeight: 'bold', width: 100 }}>Дата:</Text>
            <Text>{new Date(order.created_at).toLocaleString('ru-RU')}</Text>
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 5 }}>
            <Text style={{ fontWeight: 'bold', width: 100 }}>Получатель:</Text>
            <Text>{order.recipient.name}</Text>
          </View>
          {order.recipient.email && (
            <View style={{ flexDirection: 'row', marginBottom: 5 }}>
              <Text style={{ fontWeight: 'bold', width: 100 }}>Email:</Text>
              <Text>{order.recipient.email}</Text>
            </View>
          )}
          {order.recipient.phone && (
            <View style={{ flexDirection: 'row', marginBottom: 5 }}>
              <Text style={{ fontWeight: 'bold', width: 100 }}>Телефон:</Text>
              <Text>{order.recipient.phone}</Text>
            </View>
          )}
          {order.recipient.address && (
            <View style={{ flexDirection: 'row', marginBottom: 5 }}>
              <Text style={{ fontWeight: 'bold', width: 100 }}>Адрес:</Text>
              <Text>{order.recipient.address}</Text>
            </View>
          )}
        </View>

        {/* Items Table */}
        <View style={{ marginBottom: 20 }}>
          {/* Table Header */}
          <View 
            style={{ 
              flexDirection: 'row', 
              backgroundColor: '#f5f5f5', 
              padding: 8, 
              border: '1 solid #ddd' 
            }}
          >
            <Text style={{ fontWeight: 'bold', width: '50%' }}>Товар</Text>
            <Text style={{ fontWeight: 'bold', width: '15%' }}>Кол-во</Text>
            <Text style={{ fontWeight: 'bold', width: '20%' }}>Цена</Text>
            <Text style={{ fontWeight: 'bold', width: '15%' }}>Сумма</Text>
          </View>
          {/* Table Rows */}
          {order.items.map((item, index) => (
            <View 
              key={index}
              style={{ 
                flexDirection: 'row', 
                padding: 8, 
                border: '1 solid #ddd', 
                borderTop: 'none' 
              }}
            >
              <Text style={{ width: '50%' }}>{item.product_name}</Text>
              <Text style={{ width: '15%' }}>{item.qty.toString()}</Text>
              <Text style={{ width: '20%' }}>{formatCurrency(item.unit_price_cents)}</Text>
              <Text style={{ width: '15%' }}>{formatCurrency(item.line_total_cents)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View 
          style={{ 
            borderTop: '2 solid #000', 
            paddingTop: 20, 
            textAlign: 'right' 
          }}
        >
          <View 
            style={{ 
              flexDirection: 'row', 
              justifyContent: 'space-between', 
              marginBottom: 5 
            }}
          >
            <Text style={{ fontWeight: 'bold' }}>Подытог:</Text>
            <Text>{formatCurrency(order.subtotal_cents)}</Text>
          </View>
          <View 
            style={{ 
              flexDirection: 'row', 
              justifyContent: 'space-between', 
              borderTop: '2 solid #000', 
              paddingTop: 10, 
              marginTop: 10 
            }}
          >
            <Text style={{ fontWeight: 'bold', fontSize: 16 }}>ИТОГО:</Text>
            <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{formatCurrency(order.total_cents)}</Text>
          </View>
        </View>

        {/* Footer */}
        <View 
          style={{ 
            marginTop: 30, 
            textAlign: 'center', 
            fontSize: 8, 
            color: '#666' 
          }}
        >
          <Text style={{ marginBottom: 5 }}>Спасибо за покупку!</Text>
          <Text>Чек сгенерирован: {new Date().toLocaleString('ru-RU')}</Text>
        </View>
      </Page>
    </Document>
  );
};

@Injectable()
export class ReactPdfGeneratorService {
  private readonly logger = new Logger(ReactPdfGeneratorService.name);

  constructor(private configService: ConfigService<EnvConfig>) {}

  async generateReceiptPdf(order: Order, receiptNumber: string): Promise<{ filePath: string; url: string }> {
    try {
      this.logger.log('Starting PDF generation with @react-pdf/renderer...');
      this.logger.log('Order ID:', order.id);
      this.logger.log('Receipt Number:', receiptNumber);

      // Создаем директорию для чеков если не существует
      const storagePath = this.configService.get('RECEIPT_STORAGE_PATH');
      this.logger.log(`Creating receipts directory: ${storagePath}`);
      
      try {
        await fs.mkdir(storagePath, { recursive: true });
        this.logger.log(`Directory created successfully: ${storagePath}`);
      } catch (error) {
        this.logger.error(`Failed to create directory ${storagePath}:`, error);
        throw new Error(`Не удалось создать директорию для чеков: ${error.message}`);
      }

      const fileName = `receipt-${receiptNumber}-${Date.now()}.pdf`;
      const filePath = path.join(storagePath, fileName);
      
      this.logger.log(`Generating PDF: ${filePath}`);

      // Генерируем PDF
      const doc = <ReceiptDocument order={order} receiptNumber={receiptNumber} />;
      const pdfBuffer = await pdf(doc).toBuffer();

      // Сохраняем PDF в файл
      await fs.writeFile(filePath, pdfBuffer);

      // Проверяем, что файл создался
      try {
        await fs.access(filePath);
        this.logger.log(`PDF file created successfully: ${filePath}`);
        
        // Проверяем, что это действительно PDF
        const fileBuffer = await fs.readFile(filePath);
        const isPdf = fileBuffer.toString('ascii', 0, 4) === '%PDF';
        if (!isPdf) {
          this.logger.error(`Generated file is not a valid PDF: ${filePath}`);
          throw new Error(`Сгенерированный файл не является корректным PDF: ${filePath}`);
        }
        this.logger.log(`PDF file is valid: ${filePath}`);
      } catch (error) {
        this.logger.error(`PDF file was not created or is invalid: ${filePath}`, error);
        throw new Error(`PDF файл не был создан или некорректен: ${filePath}`);
      }

      const baseUrl = this.configService.get('RECEIPT_BASE_URL');
      const url = `${baseUrl}/receipts/${order.id}/pdf`;

      this.logger.log(`PDF чек сгенерирован: ${filePath}`);

      return { filePath, url };
    } catch (error) {
      this.logger.error('Error generating PDF:', error);
      this.logger.error('Error details:', JSON.stringify(error, null, 2));
      throw error;
    }
  }
}