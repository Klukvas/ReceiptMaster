import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Recipient } from '../recipients/entities/recipient.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { CreateTelegramOrderDto } from './dto/telegram-order.dto';
import { TelegramUpdateDto } from './dto/telegram-update.dto';

@Injectable()
export class TelegramService {
  constructor(
    @InjectRepository(Recipient)
    private recipientsRepository: Repository<Recipient>,
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(OrderItem)
    private orderItemsRepository: Repository<OrderItem>,
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  async createOrderFromTelegram(createTelegramOrderDto: CreateTelegramOrderDto): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      // 1. Найти или создать получателя
      const recipient = await this.findOrCreateRecipient(manager, createTelegramOrderDto.user);

      // 2. Проверить существование продуктов
      const productIds = createTelegramOrderDto.items.map((item) => item.productId);
      const products = await manager.find(Product, {
        where: { id: In(productIds) },
      });

      if (products.length !== productIds.length) {
        throw new NotFoundException('Один или несколько товаров не найдены');
      }

      const productMap = new Map(products.map((p) => [p.id, p]));

      // 3. Рассчитать суммы
      let subtotalCents = 0;
      const currency = products[0].currency;

      for (const itemDto of createTelegramOrderDto.items) {
        const product = productMap.get(itemDto.productId)!;
        const lineTotalCents = product.sale_price_cents * itemDto.qty;
        subtotalCents += lineTotalCents;
      }

      // 4. Создать заказ
      const order = manager.create(Order, {
        recipient_id: recipient.id,
        status: OrderStatus.DRAFT,
        currency: currency,
        subtotal_cents: subtotalCents,
        total_cents: subtotalCents,
        created_by: 'telegram_bot',
      });

      const savedOrder = await manager.save(Order, order);

      // 5. Создать позиции заказа
      for (const itemDto of createTelegramOrderDto.items) {
        const product = productMap.get(itemDto.productId)!;
        const lineTotalCents = product.sale_price_cents * itemDto.qty;

        const orderItem = manager.create(OrderItem, {
          order_id: savedOrder.id,
          product_id: product.id,
          product_name: product.name,
          unit_price_cents: product.sale_price_cents,
          qty: itemDto.qty,
          line_total_cents: lineTotalCents,
        });

        await manager.save(OrderItem, orderItem);
      }

      // 6. Подтвердить заказ
      savedOrder.status = OrderStatus.CONFIRMED;
      await manager.save(Order, savedOrder);

      return savedOrder;
    });
  }

  private async findOrCreateRecipient(manager: any, userData: any): Promise<Recipient> {
    // Ищем существующего получателя по telegram_user_id
    let recipient = await manager.findOne(Recipient, {
      where: { telegram_user_id: userData.telegram_user_id },
    });

    if (recipient) {
      // Обновляем данные получателя, если они изменились
      const updatedData: Partial<Recipient> = {};
      
      if (userData.username && userData.username !== recipient.username) {
        updatedData.username = userData.username;
      }
      if (userData.first_name && userData.first_name !== recipient.first_name) {
        updatedData.first_name = userData.first_name;
      }
      if (userData.last_name && userData.last_name !== recipient.last_name) {
        updatedData.last_name = userData.last_name;
      }
      if (userData.phone && userData.phone !== recipient.phone) {
        updatedData.phone = userData.phone;
      }

      if (Object.keys(updatedData).length > 0) {
        Object.assign(recipient, updatedData);
        recipient = await manager.save(Recipient, recipient);
      }

      return recipient;
    }

    // Создаем нового получателя
    const name = this.buildRecipientName(userData);
    
    recipient = manager.create(Recipient, {
      name: name,
      telegram_user_id: userData.telegram_user_id,
      username: userData.username || null,
      first_name: userData.first_name || null,
      last_name: userData.last_name || null,
      phone: userData.phone || null,
    });

    return await manager.save(Recipient, recipient);
  }

  private buildRecipientName(userData: any): string {
    const parts = [];
    
    if (userData.first_name) {
      parts.push(userData.first_name);
    }
    if (userData.last_name) {
      parts.push(userData.last_name);
    }
    if (userData.username) {
      parts.push(`(@${userData.username})`);
    }
    
    return parts.length > 0 ? parts.join(' ') : `Telegram User ${userData.telegram_user_id}`;
  }

  // Обработка стандартного Telegram webhook
  async handleWebhook(update: TelegramUpdateDto): Promise<void> {
    const message = update.message || update.edited_message || update.callback_query;
    
    if (!message) {
      console.log('No message in update:', update);
      return;
    }

    const user = message.from;
    if (!user) {
      console.log('No user in message:', message);
      return;
    }

    // Здесь можно добавить логику обработки разных типов сообщений
    console.log('Received message from user:', user.id, 'text:', message.text);

    // Пример обработки команды /start
    if (message.text === '/start') {
      console.log('User started bot:', user.id);
      // Здесь можно отправить приветственное сообщение
      return;
    }

    // Пример обработки контакта
    if (message.contact) {
      console.log('User shared contact:', user.id, message.contact.phone_number);
      // Здесь можно сохранить контакт пользователя
      return;
    }

    // Здесь можно добавить обработку других типов сообщений
    // Например, обработку выбора товаров, подтверждения заказа и т.д.
  }

  // Вспомогательный метод для преобразования Telegram Update в CreateTelegramOrderDto
  convertUpdateToOrderDto(update: TelegramUpdateDto, items: any[]): CreateTelegramOrderDto | null {
    const message = update.message || update.edited_message || update.callback_query;
    
    if (!message || !message.from) {
      return null;
    }

    const user = message.from;
    
    return {
      user: {
        telegram_user_id: user.id.toString(),
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: message.contact?.phone_number,
      },
      items: items,
    };
  }
}
