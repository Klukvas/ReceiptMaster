import { Document, Page, Text, View, Image } from '@react-pdf/renderer';
import { Order } from '../../orders/entities/order.entity';
import { MoneyUtil } from '../../../common/utils/money.util';

interface StandardReceiptProps {
  order: Order;
  receiptNumber: string;
  hasCustomLogo: boolean;
  companyName: string;
  logoPath?: string;
}

export const StandardReceiptDocument = ({ 
  order, 
  receiptNumber, 
  hasCustomLogo, 
  companyName, 
  logoPath 
}: StandardReceiptProps) => {
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
        {/* Header with Logo and Blue Line */}
        <View 
          style={{ 
            marginBottom: 20 
          }}
        >
          {/* Company Logo and Name */}
          <View 
            style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              marginBottom: 15 
            }}
          >
            {hasCustomLogo && logoPath && (
              <Image 
                src={logoPath} 
                style={{ 
                  width: 60, 
                  height: 60, 
                  marginRight: 15,
                  objectFit: 'contain'
                }} 
              />
            )}
            <View>
              <Text 
                style={{ 
                  fontSize: 20, 
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
              height: 4, 
              backgroundColor: '#4A90E2', 
              marginBottom: 15 
            }} 
          />

          {/* Invoice Title */}
          <View 
            style={{ 
              textAlign: 'center', 
              borderBottom: '2 solid #000', 
              paddingBottom: 15 
            }}
          >
            <Text 
              style={{ 
                fontSize: 24, 
                fontWeight: 'bold', 
                marginBottom: 15 
              }}
            >
              ФІКСАЛЬНИЙ ЧЕК
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
        </View>

        {/* Order Info */}
        <View style={{ marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', marginBottom: 5 }}>
            <Text style={{ fontWeight: 'bold', width: 100 }}>Дата:</Text>
            <Text>{new Date(order.created_at).toLocaleString('ru-RU')}</Text>
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 5 }}>
            <Text style={{ fontWeight: 'bold', width: 100 }}>Одержувач:</Text>
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
              <Text style={{ fontWeight: 'bold', width: 100 }}>Адреса:</Text>
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
              padding: 12, 
              border: '2 solid #000' 
            }}
          >
            <Text style={{ fontWeight: 'bold', width: '50%' }}>Опис товару</Text>
            <Text style={{ fontWeight: 'bold', width: '15%', textAlign: 'center' }}>Кількість</Text>
            <Text style={{ fontWeight: 'bold', width: '20%', textAlign: 'right' }}>Ціна</Text>
            <Text style={{ fontWeight: 'bold', width: '15%', textAlign: 'right' }}>Сума</Text>
          </View>
          {/* Table Rows */}
          {order.items.map((item, index) => (
            <View 
              key={index}
              style={{ 
                flexDirection: 'row', 
                padding: 12, 
                border: '2 solid #000', 
                borderTop: 'none'
              }}
            >
              <Text style={{ width: '50%', fontSize: 9 }}>{item.product_name}</Text>
              <Text style={{ width: '15%', textAlign: 'center', fontSize: 9 }}>{item.qty.toString()}</Text>
              <Text style={{ width: '20%', textAlign: 'right', fontSize: 9 }}>{formatCurrency(item.unit_price_cents)}</Text>
              <Text style={{ width: '15%', textAlign: 'right', fontSize: 9, fontWeight: 'bold' }}>{formatCurrency(item.line_total_cents)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View 
          style={{ 
            borderTop: '4 solid #4A90E2', 
            paddingTop: 20, 
            textAlign: 'right' 
          }}
        >
          <View 
            style={{ 
              flexDirection: 'row', 
              justifyContent: 'space-between', 
              marginBottom: 8,
              paddingHorizontal: 20
            }}
          >
            <Text style={{ fontWeight: 'bold', fontSize: 12 }}>Проміжний підсумок:</Text>
            <Text style={{ fontSize: 12 }}>{formatCurrency(order.subtotal_cents)}</Text>
          </View>
          <View 
            style={{ 
              flexDirection: 'row', 
              justifyContent: 'space-between', 
              backgroundColor: '#4A90E2',
              padding: 15,
              marginTop: 10,
              borderRadius: 5
            }}
          >
            <Text style={{ fontWeight: 'bold', fontSize: 18, color: 'white' }}>РАЗОМ:</Text>
            <Text style={{ fontWeight: 'bold', fontSize: 18, color: 'white' }}>{formatCurrency(order.total_cents)}</Text>
          </View>
        </View>

        {/* Footer - positioned at bottom */}
        <View 
          style={{ 
            position: 'absolute',
            bottom: 40,
            left: 40,
            right: 40,
            textAlign: 'center', 
            fontSize: 9, 
            color: '#666',
            borderTop: '2 solid #ddd',
            paddingTop: 20
          }}
        >
          <Text style={{ marginBottom: 8, fontSize: 11, fontWeight: 'bold' }}>Дякуємо за покупку!</Text>
          <Text style={{ marginBottom: 5 }}>Якщо у вас є питання, будь ласка, зв'яжіться з нами.</Text>
          <Text style={{ fontSize: 8 }}>Чек згенеровано: {new Date().toLocaleString('ru-RU')}</Text>
        </View>
      </Page>
    </Document>
  );
};
