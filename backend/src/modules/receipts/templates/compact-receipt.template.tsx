import { Document, Page, Text, View, Image } from '@react-pdf/renderer';
import { Order } from '../../orders/entities/order.entity';
import { MoneyUtil } from '../../../common/utils/money.util';

interface CompactReceiptProps {
  order: Order;
  receiptNumber: string;
  hasCustomLogo: boolean;
  companyName: string;
  logoPath?: string;
}

export const CompactReceiptDocument = ({ 
  order, 
  receiptNumber, 
  hasCustomLogo, 
  companyName, 
  logoPath 
}: CompactReceiptProps) => {
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
            {hasCustomLogo && logoPath && (
              <Image 
                src={logoPath} 
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
              Видаткова накладна
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
              padding: 1.2,
              margin: 0,
              border: '1 solid #000' 
            }}
          >
            <Text style={{ fontWeight: 'bold', width: '50%', fontSize: 6 }}>Опис товару</Text>
            <Text style={{ fontWeight: 'bold', width: '15%', textAlign: 'center', fontSize: 6 }}>Кількість</Text>
            <Text style={{ fontWeight: 'bold', width: '20%', textAlign: 'right', fontSize: 6 }}>Ціна</Text>
            <Text style={{ fontWeight: 'bold', width: '15%', textAlign: 'right', fontSize: 6 }}>Сума</Text>
          </View>
          {/* Table Rows */}
          {order.items.map((item, index) => (
            <View 
              key={index}
              style={{ 
                flexDirection: 'row', 
                padding: 1.2,
                margin: 0,
                border: '1 solid #000', 
                borderTop: 'none'
              }}
            >
              <Text style={{ width: '50%', fontSize: 5.4 }}>{item.product_name}</Text>
              <Text style={{ width: '15%', textAlign: 'center', fontSize: 5.4 }}>{item.qty.toString()}</Text>
              <Text style={{ width: '20%', textAlign: 'right', fontSize: 5.4 }}>{formatCurrency(item.unit_price_cents)}</Text>
              <Text style={{ width: '15%', textAlign: 'right', fontSize: 5.4, fontWeight: 'bold' }}>{formatCurrency(item.line_total_cents)}</Text>
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
              marginBottom: 2,
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
              alignItems: 'center',
              backgroundColor: '#4A90E2',
              padding: 4,
              marginTop: 2,
              borderRadius: 3
            }}
          >
            <Text style={{ fontWeight: 'bold', fontSize: 12, color: 'white', textAlign: 'center' }}>РАЗОМ:</Text>
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
