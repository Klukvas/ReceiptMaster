import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { ApiErrors } from "../../common/errors/ApiError";
import { InjectRepository, InjectDataSource } from "@nestjs/typeorm";
import { Repository, DataSource, In, EntityManager, MoreThan } from "typeorm";
import axios, { AxiosInstance } from "axios";
import { Recipient } from "../recipients/entities/recipient.entity";
import { Order, OrderStatus } from "../orders/entities/order.entity";
import { Product } from "../products/entities/product.entity";
import { OrderItem } from "../orders/entities/order-item.entity";
import { CreateTelegramOrderDto } from "./dto/telegram-order.dto";
import {
  TelegramUpdate,
  TelegramMessage,
  TelegramCallbackQuery,
} from "./interfaces/telegram.interface";
import { UserSession, UserState } from "./interfaces/cart.interface";

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string;
  private readonly http: AxiosInstance;
  private userSessions: Map<number, UserSession> = new Map();

  constructor(
    @InjectRepository(Recipient) private recipientsRepo: Repository<Recipient>,
    @InjectRepository(Order) private ordersRepo: Repository<Order>,
    @InjectRepository(Product) private productsRepo: Repository<Product>,
    @InjectRepository(OrderItem) private orderItemsRepo: Repository<OrderItem>,
    @InjectDataSource() private dataSource: DataSource,
  ) {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || "";
    if (!this.botToken) {
      throw ApiErrors.INTERNAL_SERVER_ERROR("TELEGRAM_BOT_TOKEN is not set");
    }
    this.http = axios.create({
      baseURL: `https://api.telegram.org/bot${this.botToken}`,
      timeout: 5000,
    });

    // Simple retry on 429 (rate limit)
    this.http.interceptors.response.use(undefined, async (err) => {
      const status = err.response?.status;
      if (status === 429) {
        const retryAfter = Number(err.response?.headers?.["retry-after"] ?? 1);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        return this.http.request(err.config);
      }
      throw err;
    });

    // Create idempotency table for update_id if it doesn't exist (Postgres)
    void this.ensureUpdatesTable();
  }

  /** Idempotency: table of processed update_id */
  private async ensureUpdatesTable() {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS tg_updates (
        processed_update_id BIGINT PRIMARY KEY,
        processed_at TIMESTAMPTZ DEFAULT now()
      );
    `);
  }

  /** Returns true if this update was already processed */
  private async isUpdateProcessed(updateId: number): Promise<boolean> {
    const res = await this.dataSource.query(
      "INSERT INTO tg_updates(processed_update_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [updateId],
    );
    // if insertion didn't happen (conflict), it means already processed
    return res.rowCount === 0;
  }

  /** Telegram Bot API responses — with ok check */
  private async tgPost<T = any>(path: string, payload: any): Promise<T> {
    const { data } = await this.http.post(path, payload);
    if (!data?.ok) {
      throw ApiErrors.INTERNAL_SERVER_ERROR(`Telegram API error: ${JSON.stringify(data)}`);
    }
    return data.result as T;
  }

  async sendMessage(
    chatId: number,
    text: string,
    options?: {
      parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
      reply_markup?: any;
      reply_to_message_id?: number;
      disable_web_page_preview?: boolean;
    },
  ) {
    return this.tgPost("/sendMessage", { chat_id: chatId, text, ...options });
  }

  async answerCallbackQuery(
    callbackQueryId: string,
    options?: {
      text?: string;
      show_alert?: boolean;
      url?: string;
    },
  ) {
    return this.tgPost("/answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...options,
    });
  }

  async editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    options?: {
      parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
      reply_markup?: any;
      disable_web_page_preview?: boolean;
    },
  ) {
    return this.tgPost("/editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...options,
    });
  }

  async sendPhotoByUrl(
    chatId: number,
    photoUrl: string,
    options?: {
      caption?: string;
      parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
      reply_markup?: any;
    },
  ) {
    return this.tgPost("/sendPhoto", {
      chat_id: chatId,
      photo: photoUrl,
      ...options,
    });
  }

  /** Main update handler (doesn't throw exceptions outside) */
  async handleWebhook(update: TelegramUpdate) {
    try {
      // idempotency
      if (update?.update_id == null) return;
      const already = await this.isUpdateProcessed(update.update_id);
      if (already) return;

      if (update.message) {
        await this.handleMessage(update.message);
        return;
      }
      if (update.callback_query) {
        await this.handleCallbackQuery(update.callback_query);
        return;
      }
      // other update types ignored for MVP
    } catch (e) {
      // DON'T throw outside: controller already returned 200
      this.logger.error("handleWebhook error", e);
    }
  }

  private async handleMessage(message: TelegramMessage) {
    const chatId = message.chat.id;
    const user = message.from;
    const text = message.text?.trim();

    if (!user) return;

    this.logger.log(
      `Handling message from ${user?.first_name} (${user?.id}): "${text}"`,
    );

    // Get or create user session
    const session = this.getOrCreateUserSession(user.id);

    // Handle commands
    if (text === "/start") {
      await this.handleStartCommand(chatId, user, session);
    } else if (text === "/help") {
      await this.handleHelpCommand(chatId);
    } else if (text === "/products") {
      await this.handleProductsCommand(chatId, session);
    } else if (text === "/order") {
      await this.handleOrderCommand(chatId, session);
    } else if (text === "/cart") {
      await this.handleCartCommand(chatId, session);
    } else if (text === "/clear") {
      await this.handleClearCommand(chatId, session);
    } else if (text === "/update") {
      await this.handleUpdateCartCommand(chatId, session);
    } else if (text) {
      // Handle based on user state
      await this.handleTextByState(chatId, text, session);
    }
  }

  private async handleCallbackQuery(cq: TelegramCallbackQuery) {
    const chatId = cq.message?.chat?.id ?? cq.from.id;
    const userId = cq.from.id;
    const data = cq.data ?? "";

    this.logger.log(`Callback query received: ${data} from user ${userId}`);

    try {
      const session = this.getOrCreateUserSession(userId);

      if (data.startsWith("add_product_")) {
        // Add product to cart
        const productId = data.replace("add_product_", "");
        await this.handleAddProduct(chatId, productId, cq);
      } else if (data === "create_order") {
        // Create order
        await this.handleCreateOrder(chatId, cq);
      } else if (data === "confirm_order") {
        // Confirm order
        await this.handleConfirmOrder(chatId, cq, session);
      } else if (data === "view_cart") {
        // Show cart
        await this.answerCallbackQuery(cq.id, { text: "Показываем корзину" });
        await this.showCart(chatId, session);
      } else if (data === "clear_cart") {
        // Clear cart
        await this.handleClearCommand(chatId, session);
        await this.answerCallbackQuery(cq.id, { text: "Корзина очищена" });
      } else if (data === "back_to_products") {
        // Return to product selection
        await this.updateUserSession(userId, {
          state: UserState.SELECTING_PRODUCT,
        });
        await this.answerCallbackQuery(cq.id, { text: "Выбираем товары" });
        await this.sendProductsList(chatId);
      } else if (data.startsWith("ADD_PRODUCT:")) {
        // Old format for compatibility
        const sku = data.split(":")[1];
        await this.sendMessage(chatId, `Добавил товар: ${sku}`);
        await this.answerCallbackQuery(cq.id, { text: "Товар добавлен" });
      } else if (data === "CONFIRM_ORDER") {
        // Old format for compatibility
        await this.sendMessage(chatId, "Заказ подтверждён. Готовим чек…");
        await this.answerCallbackQuery(cq.id, { text: "Заказ подтвержден" });
      } else {
        await this.answerCallbackQuery(cq.id, {
          text: "Неизвестная команда",
        });
      }
    } catch (error) {
      this.logger.error("Error handling callback query:", error);
      await this.answerCallbackQuery(cq.id, {
        text: "Произошла ошибка",
        show_alert: true,
      });
    }
  }

  /** Convert update to order DTO (use when forming order) */
  convertUpdateToOrderDto(
    update: TelegramUpdate,
    items: Array<{ productId: string; qty: number }>,
  ): CreateTelegramOrderDto | null {
    const msg =
      update.message ??
      update.edited_message ??
      update.callback_query?.message ??
      null;
    const from =
      update.message?.from ??
      update.edited_message?.from ??
      update.callback_query?.from ??
      null;
    if (!from) return null;

    return {
      user: {
        telegram_user_id: String(from.id),
        username: from.username ?? null,
        first_name: from.first_name ?? null,
        last_name: from.last_name ?? null,
        phone: msg?.contact?.phone_number ?? null,
      },
      items,
    };
  }

  /** Create order from Telegram with transaction and locking */
  async createOrderFromTelegram(dto: CreateTelegramOrderDto): Promise<Order> {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      // 1) Recipient (find-or-create) by telegram_user_id
      const recipient = await this.findOrCreateRecipient(manager, dto.user);

      // 2) Load products + pessimistic locking to avoid inventory race conditions
      const productIds = dto.items.map((i) => i.productId);
      const products = await manager.getRepository(Product).find({
        where: { id: In(productIds) },
        lock: { mode: "pessimistic_write" },
      });
      if (products.length !== productIds.length) {
        throw ApiErrors.PRODUCT_NOT_FOUND("One or more products not found");
      }

      // 3) Validations: single currency, stock availability
      const currencies = new Set(products.map((p) => p.currency));
      if (currencies.size !== 1) {
        throw ApiErrors.VALIDATION_ERROR("currency", "Все товары в заказе должны быть в одной валюте");
      }
      const currency = products[0].currency;

      const byId = new Map(products.map((p) => [p.id, p]));
      let subtotalCents = 0;

      for (const it of dto.items) {
        const p = byId.get(it.productId)!;
        if (p.quantity < it.qty) {
          throw ApiErrors.VALIDATION_ERROR("quantity", `Недостаточно товара "${p.name}". Доступно: ${p.quantity}, запрошено: ${it.qty}`);
        }
        subtotalCents += p.sale_price_cents * it.qty;
      }

      // 4) Create order (MVP: immediately CONFIRMED; for payment — make RESERVED/WAITING_PAYMENT)
      const order = manager.getRepository(Order).create({
        recipient_id: recipient.id,
        status: OrderStatus.CONFIRMED, // or DRAFT → then CONFIRMED
        currency,
        subtotal_cents: subtotalCents,
        total_cents: subtotalCents,
        created_by: "telegram_bot", // fix enum in model
      });
      const savedOrder = await manager.getRepository(Order).save(order);

      // 5) Order items + quantity deduction
      for (const it of dto.items) {
        const p = byId.get(it.productId)!;
        const lineTotal = p.sale_price_cents * it.qty;

        const oi = manager.getRepository(OrderItem).create({
          order_id: savedOrder.id,
          product_id: p.id,
          product_name: p.name,
          unit_price_cents: p.sale_price_cents,
          qty: it.qty,
          line_total_cents: lineTotal,
        });
        await manager.getRepository(OrderItem).save(oi);

        p.quantity -= it.qty;
        await manager.getRepository(Product).save(p);
      }

      return savedOrder;
    });
  }

  private async findOrCreateRecipient(
    manager: EntityManager,
    user: {
      telegram_user_id: string;
      username?: string;
      first_name?: string;
      last_name?: string;
      phone?: string;
    },
  ): Promise<Recipient> {
    let recipient = await manager.getRepository(Recipient).findOne({
      where: { telegram_user_id: user.telegram_user_id },
    });

    if (recipient) {
      const patch: Partial<Recipient> = {};
      if (user.username && user.username !== recipient.username)
        patch.username = user.username;
      if (user.first_name && user.first_name !== recipient.first_name)
        patch.first_name = user.first_name;
      if (user.last_name && user.last_name !== recipient.last_name)
        patch.last_name = user.last_name;
      if (user.phone && user.phone !== recipient.phone)
        patch.phone = user.phone;

      if (Object.keys(patch).length) {
        Object.assign(recipient, patch);
        recipient = await manager.getRepository(Recipient).save(recipient);
      }
      return recipient;
    }

    const nameParts = [];
    if (user.first_name) nameParts.push(user.first_name);
    if (user.last_name) nameParts.push(user.last_name);
    if (user.username) nameParts.push(`(@${user.username})`);
    const name = nameParts.length
      ? nameParts.join(" ")
      : `Telegram User ${user.telegram_user_id}`;

    recipient = manager.getRepository(Recipient).create({
      name,
      telegram_user_id: user.telegram_user_id,
      username: user.username || null,
      first_name: user.first_name || null,
      last_name: user.last_name || null,
      phone: user.phone || null,
    });
    return manager.getRepository(Recipient).save(recipient);
  }

  // Methods for working with user sessions
  private getOrCreateUserSession(userId: number): UserSession {
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, {
        userId,
        state: UserState.IDLE,
        cart: {
          userId,
          items: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }
    return this.userSessions.get(userId)!;
  }

  private updateUserSession(userId: number, updates: Partial<UserSession>) {
    const session = this.getOrCreateUserSession(userId);
    Object.assign(session, updates);
    session.cart.updatedAt = new Date();
    this.userSessions.set(userId, session);
  }

  // Command handlers
  private async handleStartCommand(
    chatId: number,
    user: any,
    _session: UserSession,
  ) {
    await this.updateUserSession(user.id, { state: UserState.IDLE });
    await this.sendMessage(
      chatId,
      `Привет, ${user.first_name}! 👋\n\nЯ бот для заказа товаров.\n\n` +
        `Доступные команды:\n` +
        `🛍️ /products - Посмотреть товары\n` +
        `📝 /cart - Посмотреть корзину\n` +
        `🔄 /update - Обновить корзину\n` +
        `🗑️ /clear - Очистить корзину\n\n` +
        `Для начала выберите товары командой /products`,
    );
  }

  private async handleHelpCommand(chatId: number) {
    await this.sendMessage(
      chatId,
      `🤖 *Доступные команды:*\n\n` +
        `🛍️ /products - Посмотреть товары\n` +
        `📝 /cart - Посмотреть корзину\n` +
        `🔄 /update - Обновить корзину (проверить наличие)\n` +
        `🗑️ /clear - Очистить корзину\n` +
        `❓ /help - Показать это сообщение\n\n` +
        `*Как сделать заказ:*\n` +
        `1. Выберите товары командой /products\n` +
        `2. Нажмите кнопку товара\n` +
        `3. Введите количество\n` +
        `4. Повторите для других товаров\n` +
        `5. Проверьте корзину командой /cart\n` +
        `6. При необходимости обновите командой /update\n` +
        `7. Подтвердите заказ`,
      { parse_mode: "Markdown" },
    );
  }

  private async handleProductsCommand(chatId: number, session: UserSession) {
    await this.updateUserSession(session.userId, {
      state: UserState.SELECTING_PRODUCT,
    });
    await this.sendProductsList(chatId);
  }

  private async handleOrderCommand(chatId: number, session: UserSession) {
    if (session.cart.items.length === 0) {
      await this.sendMessage(
        chatId,
        "🛒 Ваша корзина пуста. Сначала добавьте товары командой /products",
      );
      return;
    }
    await this.showOrderReview(chatId, session);
  }

  private async handleCartCommand(chatId: number, session: UserSession) {
    if (session.cart.items.length === 0) {
      await this.sendMessage(chatId, "🛒 Ваша корзина пуста");
      return;
    }
    await this.showCart(chatId, session);
  }

  private async handleClearCommand(chatId: number, session: UserSession) {
    await this.updateUserSession(session.userId, {
      state: UserState.IDLE,
      cart: {
        userId: session.userId,
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await this.sendMessage(chatId, "🗑️ Корзина очищена");
  }

  private async handleUpdateCartCommand(chatId: number, session: UserSession) {
    if (session.cart.items.length === 0) {
      await this.sendMessage(chatId, "🛒 Корзина пуста");
      return;
    }

    // Check product availability and update cart
    const updatedItems = [];
    const unavailableItems = [];

    for (const item of session.cart.items) {
      const product = await this.productsRepo.findOne({
        where: { id: item.productId },
      });

      if (!product) {
        unavailableItems.push(`${item.name} (товар не найден)`);
        continue;
      }

      if (product.quantity <= 0) {
        unavailableItems.push(`${item.name} (товар закончился)`);
        continue;
      }

      // Update quantity to available maximum
      const availableQuantity = Math.min(item.quantity, product.quantity);
      if (availableQuantity !== item.quantity) {
        updatedItems.push({
          ...item,
          quantity: availableQuantity,
        });
        if (item.quantity > product.quantity) {
          unavailableItems.push(
            `${item.name} (уменьшено с ${item.quantity} до ${availableQuantity})`,
          );
        }
      } else {
        updatedItems.push(item);
      }
    }

    // Update cart
    await this.updateUserSession(session.userId, {
      cart: {
        ...session.cart,
        items: updatedItems,
      },
    });

    let messageText = "🔄 *Корзина обновлена*\n\n";

    if (unavailableItems.length > 0) {
      messageText += "❌ *Проблемы с товарами:*\n";
      unavailableItems.forEach((item) => {
        messageText += `• ${item}\n`;
      });
      messageText += "\n";
    }

    if (updatedItems.length > 0) {
      messageText += "✅ *Доступные товары:*\n";
      updatedItems.forEach((item) => {
        messageText += `• ${item.name} - ${item.quantity} шт.\n`;
      });
      messageText += "\n";
    }

    if (updatedItems.length === 0) {
      messageText +=
        "🛒 Корзина теперь пуста. Добавьте товары командой /products";
    } else {
      messageText +=
        "Используйте /cart для просмотра корзины или /order для оформления заказа";
    }

    await this.sendMessage(chatId, messageText, { parse_mode: "Markdown" });
  }

  private async handleTextByState(
    chatId: number,
    text: string,
    session: UserSession,
  ) {
    switch (session.state) {
      case UserState.ENTERING_QUANTITY:
        await this.handleQuantityInput(chatId, text, session);
        break;
      default:
        await this.sendMessage(
          chatId,
          `Не понимаю команду "${text}". Используйте /help для списка команд.`,
        );
    }
  }

  private async handleAddProduct(
    chatId: number,
    productId: string,
    callbackQuery: TelegramCallbackQuery,
  ) {
    try {
      const userId = callbackQuery.from.id;
      this.getOrCreateUserSession(userId);

      // Get product information
      const product = await this.productsRepo.findOne({
        where: { id: productId },
      });

      if (!product) {
        await this.answerCallbackQuery(callbackQuery.id, {
          text: "Товар не найден",
          show_alert: true,
        });
        return;
      }

      // Update user state
      await this.updateUserSession(userId, {
        state: UserState.ENTERING_QUANTITY,
        pendingProductId: productId,
      });

      await this.answerCallbackQuery(callbackQuery.id, {
        text: `Выберите количество для ${product.name}`,
      });

      // Send request for quantity input
      await this.sendMessage(
        chatId,
        `🛒 *${product.name}*\n💰 Цена: ${(product.sale_price_cents / 100).toFixed(2)} грн\n\n` +
          `Введите количество товара (от 1 до 99):`,
        { parse_mode: "Markdown" },
      );
    } catch (error) {
      this.logger.error("Error adding product:", error);
      await this.answerCallbackQuery(callbackQuery.id, {
        text: "Ошибка при добавлении товара",
        show_alert: true,
      });
    }
  }

  private async handleCreateOrder(
    chatId: number,
    callbackQuery: TelegramCallbackQuery,
  ) {
    const userId = callbackQuery.from.id;
    const session = this.getOrCreateUserSession(userId);

    if (session.cart.items.length === 0) {
      await this.answerCallbackQuery(callbackQuery.id, {
        text: "Корзина пуста",
        show_alert: true,
      });
      return;
    }

    await this.answerCallbackQuery(callbackQuery.id, {
      text: "Переходим к оформлению заказа",
    });

    await this.showOrderReview(chatId, session);
  }

  private async handleQuantityInput(
    chatId: number,
    text: string,
    session: UserSession,
  ) {
    const quantity = parseInt(text);

    if (isNaN(quantity) || quantity < 1 || quantity > 99) {
      await this.sendMessage(
        chatId,
        "❌ Введите корректное количество (от 1 до 99):",
      );
      return;
    }

    if (!session.pendingProductId) {
      await this.sendMessage(
        chatId,
        "❌ Ошибка: товар не найден. Попробуйте снова.",
      );
      await this.updateUserSession(session.userId, {
        state: UserState.SELECTING_PRODUCT,
      });
      return;
    }

    try {
      // Get product information
      const product = await this.productsRepo.findOne({
        where: { id: session.pendingProductId },
      });

      if (!product) {
        await this.sendMessage(chatId, "❌ Товар не найден");
        await this.updateUserSession(session.userId, {
          state: UserState.SELECTING_PRODUCT,
        });
        return;
      }

      // Check stock availability
      if (product.quantity < quantity) {
        await this.sendMessage(
          chatId,
          `❌ Недостаточно товара на складе.\n📦 В наличии: ${product.quantity}\n🛒 Запрошено: ${quantity}`,
        );
        return;
      }

      // Add product to cart
      const existingItemIndex = session.cart.items.findIndex(
        (item) => item.productId === product.id,
      );

      if (existingItemIndex >= 0) {
        // Update existing product
        session.cart.items[existingItemIndex].quantity += quantity;
      } else {
        // Add new product
        session.cart.items.push({
          productId: product.id,
          name: product.name,
          price: product.sale_price_cents,
          quantity: quantity,
        });
      }

      await this.updateUserSession(session.userId, {
        state: UserState.SELECTING_PRODUCT,
        pendingProductId: undefined,
      });

      await this.sendMessage(
        chatId,
        `✅ *${product.name}* добавлен в корзину!\n` +
          `📦 Количество: ${quantity}\n` +
          `💰 Цена: ${(product.sale_price_cents / 100).toFixed(2)} грн\n\n` +
          `Продолжите выбор товаров или используйте /cart для просмотра корзины`,
        { parse_mode: "Markdown" },
      );
    } catch (error) {
      this.logger.error("Error handling quantity input:", error);
      await this.sendMessage(chatId, "❌ Произошла ошибка. Попробуйте снова.");
      await this.updateUserSession(session.userId, {
        state: UserState.SELECTING_PRODUCT,
      });
    }
  }

  private async showCart(chatId: number, session: UserSession) {
    if (session.cart.items.length === 0) {
      await this.sendMessage(chatId, "🛒 Ваша корзина пуста");
      return;
    }

    let messageText = "🛒 *Ваша корзина:*\n\n";
    let totalPrice = 0;

    session.cart.items.forEach((item, index) => {
      const itemTotal = item.price * item.quantity;
      totalPrice += itemTotal;

      messageText += `${index + 1}. *${item.name}*\n`;
      messageText += `   📦 Количество: ${item.quantity}\n`;
      messageText += `   💰 Цена за штуку: ${(item.price / 100).toFixed(2)} грн\n`;
      messageText += `   💵 Итого: ${(itemTotal / 100).toFixed(2)} грн\n\n`;
    });

    messageText += `💰 *Общая сумма: ${(totalPrice / 100).toFixed(2)} грн*\n\n`;
    messageText +=
      "Используйте /order для оформления заказа или /clear для очистки корзины";

    await this.sendMessage(chatId, messageText, { parse_mode: "Markdown" });
  }

  private async showOrderReview(chatId: number, session: UserSession) {
    await this.updateUserSession(session.userId, {
      state: UserState.REVIEWING_ORDER,
    });

    let messageText = "📝 *Проверьте ваш заказ:*\n\n";
    let totalPrice = 0;

    session.cart.items.forEach((item, index) => {
      const itemTotal = item.price * item.quantity;
      totalPrice += itemTotal;

      messageText += `${index + 1}. *${item.name}*\n`;
      messageText += `   📦 Количество: ${item.quantity}\n`;
      messageText += `   💰 Цена: ${(itemTotal / 100).toFixed(2)} грн\n\n`;
    });

    messageText += `💰 *Общая сумма: ${(totalPrice / 100).toFixed(2)} грн*\n\n`;
    messageText += "Подтвердите заказ или отредактируйте корзину:";

    const keyboard = [
      [{ text: "✅ Подтвердить заказ", callback_data: "confirm_order" }],
      [
        { text: "🛒 Корзина", callback_data: "view_cart" },
        { text: "🗑️ Очистить", callback_data: "clear_cart" },
      ],
      [{ text: "🛍️ Добавить товары", callback_data: "back_to_products" }],
    ];

    await this.sendMessage(chatId, messageText, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  private async handleConfirmOrder(
    chatId: number,
    callbackQuery: TelegramCallbackQuery,
    session: UserSession,
  ) {
    try {
      await this.answerCallbackQuery(callbackQuery.id, {
        text: "Создаем заказ...",
      });

      if (session.cart.items.length === 0) {
        await this.sendMessage(chatId, "❌ Корзина пуста");
        return;
      }

      // Check product availability before creating order
      const unavailableItems = [];
      for (const item of session.cart.items) {
        const product = await this.productsRepo.findOne({
          where: { id: item.productId },
        });

        if (!product) {
          unavailableItems.push(`${item.name} (товар не найден)`);
        } else if (product.quantity < item.quantity) {
          unavailableItems.push(
            `${item.name} (доступно: ${product.quantity}, запрошено: ${item.quantity})`,
          );
        }
      }

      if (unavailableItems.length > 0) {
        await this.sendMessage(
          chatId,
          `❌ *Недостаточно товаров на складе:*\n\n` +
            unavailableItems.map((item) => `• ${item}`).join("\n") +
            `\n\n🛒 Обновите корзину командой /cart или выберите другие товары.`,
          { parse_mode: "Markdown" },
        );
        return;
      }

      // Create order from cart
      const orderDto: CreateTelegramOrderDto = {
        user: {
          telegram_user_id: session.userId.toString(),
          first_name: callbackQuery.from.first_name,
          last_name: callbackQuery.from.last_name,
          username: callbackQuery.from.username,
        },
        items: session.cart.items.map((item) => ({
          productId: item.productId,
          qty: item.quantity,
        })),
      };

      // Create order in database
      const order = await this.createOrderFromTelegram(orderDto);

      // Clear cart
      await this.updateUserSession(session.userId, {
        state: UserState.IDLE,
        cart: {
          userId: session.userId,
          items: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Send confirmation
      await this.sendMessage(
        chatId,
        `🎉 *Заказ создан успешно!*\n\n` +
          `📋 Номер заказа: ${order.id}\n` +
          `💰 Сумма: ${(order.total_cents / 100).toFixed(2)} грн\n` +
          `📅 Дата: ${new Date(order.created_at).toLocaleString("ru-RU")}\n\n` +
          `Спасибо за заказ! 🛍️`,
        { parse_mode: "Markdown" },
      );
    } catch (error) {
      this.logger.error("Error confirming order:", error);

      let errorMessage =
        "❌ Произошла ошибка при создании заказа. Попробуйте снова.";

      if (error instanceof BadRequestException) {
        // If it's a product shortage error, show details
        errorMessage = `❌ *Ошибка заказа:*\n\n${error.message}\n\n🛒 Проверьте наличие товаров и обновите корзину.`;
      } else if (error.message?.includes("Недостаточно товара")) {
        errorMessage = `❌ *Недостаточно товаров:*\n\n${error.message}\n\n🛒 Обновите корзину командой /cart.`;
      }

      await this.answerCallbackQuery(callbackQuery.id, {
        text: "Ошибка при создании заказа",
        show_alert: true,
      });

      await this.sendMessage(chatId, errorMessage, { parse_mode: "Markdown" });
    }
  }

  private async sendProductsList(chatId: number) {
    try {
      // Get all products from database
      const products = await this.productsRepo.find({
        order: { name: "ASC" },
        where: { quantity: MoreThan(0) },
      });

      if (products.length === 0) {
        await this.sendMessage(chatId, "📦 Товары временно недоступны.");
        return;
      }

      // Create text with products
      let messageText = "🛍️ *Наши товары:*\n\n";
      products.forEach((product) => {
        const price = (product.sale_price_cents / 100).toFixed(2); // price in kopecks -> hryvnias
        messageText += `*${product.name}*\n`;
        messageText += `💰 ${price} грн`;
        messageText += "\n\n";
      });

      messageText += "💡 Нажмите кнопку ниже для заказа или напишите /order";

      // Create inline buttons for each product
      const buttons = products.map((product) => ({
        text: `🛒 ${product.name}`,
        callback_data: `add_product_${product.id}`,
      }));

      // Add "Create order" button
      buttons.push({
        text: "📝 Оформить заказ",
        callback_data: "create_order",
      });

      // Split buttons into rows (2 per row)
      const keyboard = [];
      for (let i = 0; i < buttons.length; i += 2) {
        keyboard.push(buttons.slice(i, i + 2));
      }

      await this.sendMessage(chatId, messageText, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: keyboard,
        },
      });
    } catch (error) {
      this.logger.error("Error sending products list:", error);
      await this.sendMessage(
        chatId,
        "❌ Ошибка при загрузке товаров. Попробуйте позже.",
      );
    }
  }
}
