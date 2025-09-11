import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { pdf, Document, Page, Text, View, Font, Image } from '@react-pdf/renderer';
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
    // Try dist first, then fallback to src
    const distPath = path.join(__dirname, '../../assets/fonts', fontFile);
    const srcPath = path.join(process.cwd(), 'src/assets/fonts', fontFile);
    
    // Check if dist file exists, otherwise use src
    try {
      require('fs').accessSync(distPath);
      return distPath;
    } catch {
      return srcPath;
    }
  }
};

// Determine the correct path for logo based on environment
const getLogoPath = () => {
  const isDevelopment = __dirname.includes('/src/');
  if (isDevelopment) {
    return path.join(__dirname, '../../../assets/logo.png');
  } else {
    // In production, try dist first, then fallback to src
    const distPath = path.join(__dirname, '../../assets/logo.png');
    const srcPath = path.join(process.cwd(), 'src/assets/logo.png');
    
    // Check if dist file exists, otherwise use src
    try {
      require('fs').accessSync(distPath);
      return distPath;
    } catch {
      return srcPath;
    }
  }
};


Font.register({
  family: 'NotoSans',
  fonts: [
    { src: getFontPath('NotoSans-Regular.ttf'), fontWeight: 'normal' },
    { src: getFontPath('NotoSans_Condensed-Bold.ttf'), fontWeight: 'bold' },
  ],
});

const CompactReceiptDocument = ({ order, receiptNumber, hasCustomLogo, companyName }: { order: Order; receiptNumber: string; hasCustomLogo: boolean; companyName: string }) => {
  const formatCurrency = (cents: number) => 
    MoneyUtil.formatCentsToCurrency(cents, order.currency);

  return (
    <Document>
      <Page 
        size="A4" 
        style={{ 
          padding: 20, 
          fontFamily: 'NotoSans',
          fontSize: 8,
          lineHeight: 1.2 
        }}
      >
        {/* Header with Logo and Blue Line */}
        <View 
          style={{ 
            marginBottom: 10 
          }}
        >
          {/* Company Logo and Name */}
          <View 
            style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              marginBottom: 8 
            }}
          >
            {hasCustomLogo && (
              <Image 
                src={getLogoPath()} 
                style={{ 
                  width: 40, 
                  height: 40, 
                  marginRight: 10,
                  objectFit: 'contain'
                }} 
              />
            )}
            <View>
              <Text 
                style={{ 
                  fontSize: 14, 
                  fontWeight: 'bold', 
                  color: '#333' 
                }}
              >
                {companyName}
              </Text>
            </View>
          </View>

          {/* Blue Line */}
          <View 
            style={{ 
              height: 2, 
              backgroundColor: '#4A90E2', 
              marginBottom: 8 
            }} 
          />

          {/* Invoice Title */}
          <View 
            style={{ 
              textAlign: 'center', 
              borderBottom: '1 solid #000', 
              paddingBottom: 8 
            }}
          >
            <Text 
              style={{ 
                fontSize: 16, 
                fontWeight: 'bold', 
                marginBottom: 8 
              }}
            >
              ФІКСАЛЬНИЙ ЧЕК
            </Text>
            <Text 
              style={{ 
                fontSize: 10, 
                color: '#666' 
              }}
            >
              № {receiptNumber}
            </Text>
          </View>
        </View>

        {/* Order Info */}
        <View style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', marginBottom: 2 }}>
            <Text style={{ fontWeight: 'bold', width: 60, fontSize: 7 }}>Дата:</Text>
            <Text style={{ fontSize: 7 }}>{new Date(order.created_at).toLocaleString('ru-RU')}</Text>
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 2 }}>
            <Text style={{ fontWeight: 'bold', width: 60, fontSize: 7 }}>Одержувач:</Text>
            <Text style={{ fontSize: 7 }}>{order.recipient.name}</Text>
          </View>
          {order.recipient.email && (
            <View style={{ flexDirection: 'row', marginBottom: 2 }}>
              <Text style={{ fontWeight: 'bold', width: 60, fontSize: 7 }}>Email:</Text>
              <Text style={{ fontSize: 7 }}>{order.recipient.email}</Text>
            </View>
          )}
          {order.recipient.phone && (
            <View style={{ flexDirection: 'row', marginBottom: 2 }}>
              <Text style={{ fontWeight: 'bold', width: 60, fontSize: 7 }}>Телефон:</Text>
              <Text style={{ fontSize: 7 }}>{order.recipient.phone}</Text>
            </View>
          )}
          {order.recipient.address && (
            <View style={{ flexDirection: 'row', marginBottom: 2 }}>
              <Text style={{ fontWeight: 'bold', width: 60, fontSize: 7 }}>Адреса:</Text>
              <Text style={{ fontSize: 7 }}>{order.recipient.address}</Text>
            </View>
          )}
        </View>

        {/* Items Table */}
        <View style={{ marginBottom: 8 }}>
          {/* Table Header */}
          <View 
            style={{ 
              flexDirection: 'row', 
              padding: 4, 
              border: '1 solid #000' 
            }}
          >
            <Text style={{ fontWeight: 'bold', width: '50%', fontSize: 7 }}>Опис товару</Text>
            <Text style={{ fontWeight: 'bold', width: '15%', textAlign: 'center', fontSize: 7 }}>Кількість</Text>
            <Text style={{ fontWeight: 'bold', width: '20%', textAlign: 'right', fontSize: 7 }}>Ціна</Text>
            <Text style={{ fontWeight: 'bold', width: '15%', textAlign: 'right', fontSize: 7 }}>Сума</Text>
          </View>
          {/* Table Rows */}
          {order.items.map((item, index) => (
            <View 
              key={index}
              style={{ 
                flexDirection: 'row', 
                padding: 4, 
                border: '1 solid #000', 
                borderTop: 'none'
              }}
            >
              <Text style={{ width: '50%', fontSize: 6 }}>{item.product_name}</Text>
              <Text style={{ width: '15%', textAlign: 'center', fontSize: 6 }}>{item.qty.toString()}</Text>
              <Text style={{ width: '20%', textAlign: 'right', fontSize: 6 }}>{formatCurrency(item.unit_price_cents)}</Text>
              <Text style={{ width: '15%', textAlign: 'right', fontSize: 6, fontWeight: 'bold' }}>{formatCurrency(item.line_total_cents)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View 
          style={{ 
            borderTop: '2 solid #4A90E2', 
            paddingTop: 6, 
            textAlign: 'right' 
          }}
        >
          <View 
            style={{ 
              flexDirection: 'row', 
              justifyContent: 'space-between', 
              marginBottom: 3,
              paddingHorizontal: 8
            }}
          >
            <Text style={{ fontWeight: 'bold', fontSize: 8 }}>Проміжний підсумок:</Text>
            <Text style={{ fontSize: 8 }}>{formatCurrency(order.subtotal_cents)}</Text>
          </View>
          <View 
            style={{ 
              flexDirection: 'row', 
              justifyContent: 'space-between', 
              backgroundColor: '#4A90E2',
              padding: 6,
              marginTop: 3,
              borderRadius: 3
            }}
          >
            <Text style={{ fontWeight: 'bold', fontSize: 12, color: 'white' }}>РАЗОМ:</Text>
            <Text style={{ fontWeight: 'bold', fontSize: 12, color: 'white' }}>{formatCurrency(order.total_cents)}</Text>
          </View>
        </View>

        {/* Footer - flexible positioning */}
        <View 
          style={{ 
            marginTop: 20,
            textAlign: 'center', 
            fontSize: 6, 
            color: '#666',
            borderTop: '1 solid #ddd',
            paddingTop: 10
          }}
        >
          <Text style={{ marginBottom: 5, fontSize: 7, fontWeight: 'bold' }}>Дякуємо за покупку!</Text>
          <Text style={{ marginBottom: 3, fontSize: 6 }}>Якщо у вас є питання, будь ласка, зв'яжіться з нами.</Text>
          <Text style={{ fontSize: 5 }}>Чек згенеровано: {new Date().toLocaleString('ru-RU')}</Text>
        </View>
      </Page>
    </Document>
  );
};

@Injectable()
export class CompactPdfGeneratorService {
  private readonly logger = new Logger(CompactPdfGeneratorService.name);

  constructor(private configService: ConfigService<EnvConfig>) {}

  async generateReceiptPdf(order: Order, receiptNumber: string, companyName: string = ''): Promise<{ filePath: string; url: string }> {
    try {
      this.logger.log('Починаємо генерацію компактного PDF за допомогою @react-pdf/renderer...');
      this.logger.log('ID замовлення:', order.id);
      this.logger.log('Номер чека:', receiptNumber);

      // Check if custom logo exists
      let hasCustomLogo = false;
      try {
        const logoPath = getLogoPath();
        await fs.access(logoPath);
        hasCustomLogo = true;
        this.logger.log(`Custom logo found at ${logoPath}, using uploaded logo`);
      } catch (error) {
        this.logger.log(`No custom logo found, using fallback logo. Error: ${error.message}`);
      }

      // Создаем директорию для чеков если не существует
      const storagePath = this.configService.get('RECEIPT_STORAGE_PATH');
      this.logger.log(`Створюємо директорію для чеків: ${storagePath}`);
      
      try {
        await fs.mkdir(storagePath, { recursive: true });
        this.logger.log(`Директорію успішно створено: ${storagePath}`);
      } catch (error) {
        this.logger.error(`Не вдалося створити директорію ${storagePath}:`, error);
        throw new Error(`Не вдалося створити директорію для чеків: ${error.message}`);
      }

      const fileName = `compact-receipt-${receiptNumber}-${Date.now()}.pdf`;
      const filePath = path.join(storagePath, fileName);
      
      this.logger.log(`Генеруємо компактний PDF: ${filePath}`);

      // Генерируем PDF
      const doc = <CompactReceiptDocument order={order} receiptNumber={receiptNumber} hasCustomLogo={hasCustomLogo} companyName={companyName} />;
      const pdfBuffer = await pdf(doc).toBuffer();

      // Сохраняем PDF в файл
      await fs.writeFile(filePath, pdfBuffer);

      // Проверяем, что файл создался
      try {
        await fs.access(filePath);
        this.logger.log(`Компактний PDF-файл успішно створено: ${filePath}`);
        
        // Проверяем, что это действительно PDF
        const fileBuffer = await fs.readFile(filePath);
        const isPdf = fileBuffer.toString('ascii', 0, 4) === '%PDF';
        if (!isPdf) {
          this.logger.error(`Згенерований файл не є коректним PDF: ${filePath}`);
          throw new Error(`Згенерований файл не є коректним PDF: ${filePath}`);
        }
        this.logger.log(`Компактний PDF-файл є коректним: ${filePath}`);
      } catch (error) {
        this.logger.error(`Компактний PDF-файл не створено або він некоректний: ${filePath}`, error);
        throw new Error(`Компактний PDF-файл не було створено або він некоректний: ${filePath}`);
      }

      const baseUrl = this.configService.get('RECEIPT_BASE_URL');
      const url = `${baseUrl}/receipts/${order.id}/pdf`;

      this.logger.log(`Компактний PDF чек згенеровано: ${filePath}`);

      return { filePath, url };
    } catch (error) {
      this.logger.error('Помилка під час генерації компактного PDF:', error);
      this.logger.error('Деталі помилки:', JSON.stringify(error, null, 2));
      throw error;
    }
  }
}
