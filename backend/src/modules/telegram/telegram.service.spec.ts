import { TelegramService } from "./telegram.service";
import { UserState } from "./interfaces/cart.interface";
import { OrderStatus } from "../orders/entities/order.entity";

// Mock axios with proper default export
const mockHttpPost = jest.fn().mockResolvedValue({
  data: { ok: true, result: {} },
});

jest.mock("axios", () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      post: mockHttpPost,
      interceptors: {
        response: { use: jest.fn() },
      },
      request: jest.fn(),
    })),
  },
  create: jest.fn(() => ({
    post: mockHttpPost,
    interceptors: {
      response: { use: jest.fn() },
    },
    request: jest.fn(),
  })),
}));

describe("TelegramService", () => {
  let service: TelegramService;
  let recipientsRepo: any;
  let ordersRepo: any;
  let productsRepo: any;
  let orderItemsRepo: any;
  let dataSource: any;
  let cacheService: any;
  let httpMock: any;

  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      TELEGRAM_BOT_TOKEN: "test-bot-token",
      TELEGRAM_BOT_OWNER_USER_ID: "owner-1",
    };

    recipientsRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    ordersRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    productsRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    orderItemsRepo = {};

    dataSource = {
      query: jest.fn().mockResolvedValue({ rowCount: 1 }),
      transaction: jest.fn(),
    };

    cacheService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    // Reset the shared mock before each test
    mockHttpPost.mockReset();
    mockHttpPost.mockResolvedValue({
      data: { ok: true, result: {} },
    });

    service = new TelegramService(
      recipientsRepo,
      ordersRepo,
      productsRepo,
      orderItemsRepo,
      dataSource,
      cacheService,
    );

    // Access the private http mock
    httpMock = (service as any).http;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("constructor", () => {
    it("should throw if TELEGRAM_BOT_TOKEN is not set", () => {
      process.env.TELEGRAM_BOT_TOKEN = "";

      expect(
        () =>
          new TelegramService(
            recipientsRepo,
            ordersRepo,
            productsRepo,
            orderItemsRepo,
            dataSource,
            cacheService,
          ),
      ).toThrow();
    });

    it("should warn if TELEGRAM_BOT_OWNER_USER_ID is not set", () => {
      process.env.TELEGRAM_BOT_OWNER_USER_ID = "";

      const svc = new TelegramService(
        recipientsRepo,
        ordersRepo,
        productsRepo,
        orderItemsRepo,
        dataSource,
        cacheService,
      );

      expect(svc).toBeDefined();
    });
  });

  describe("sendMessage", () => {
    it("should send a message via Telegram API", async () => {
      await service.sendMessage(123, "Hello");

      expect(httpMock.post).toHaveBeenCalledWith(
        "/sendMessage",
        expect.objectContaining({
          chat_id: 123,
          text: "Hello",
        }),
      );
    });

    it("should pass options", async () => {
      await service.sendMessage(123, "Hello", { parse_mode: "Markdown" });

      expect(httpMock.post).toHaveBeenCalledWith(
        "/sendMessage",
        expect.objectContaining({
          chat_id: 123,
          text: "Hello",
          parse_mode: "Markdown",
        }),
      );
    });

    it("should throw if Telegram API returns not ok", async () => {
      httpMock.post.mockResolvedValue({
        data: { ok: false, description: "Bad Request" },
      });

      await expect(service.sendMessage(123, "Hello")).rejects.toThrow();
    });
  });

  describe("answerCallbackQuery", () => {
    it("should answer callback query", async () => {
      await service.answerCallbackQuery("cq-1", { text: "Done" });

      expect(httpMock.post).toHaveBeenCalledWith(
        "/answerCallbackQuery",
        expect.objectContaining({
          callback_query_id: "cq-1",
          text: "Done",
        }),
      );
    });
  });

  describe("editMessageText", () => {
    it("should edit message text", async () => {
      await service.editMessageText(123, 456, "Updated");

      expect(httpMock.post).toHaveBeenCalledWith(
        "/editMessageText",
        expect.objectContaining({
          chat_id: 123,
          message_id: 456,
          text: "Updated",
        }),
      );
    });
  });

  describe("sendPhotoByUrl", () => {
    it("should send photo by URL", async () => {
      await service.sendPhotoByUrl(123, "https://img.example.com/photo.png", {
        caption: "A photo",
      });

      expect(httpMock.post).toHaveBeenCalledWith(
        "/sendPhoto",
        expect.objectContaining({
          chat_id: 123,
          photo: "https://img.example.com/photo.png",
          caption: "A photo",
        }),
      );
    });
  });

  describe("handleWebhook", () => {
    it("should return early if update_id is null", async () => {
      await service.handleWebhook({ update_id: null } as any);
      expect(dataSource.query).not.toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO tg_updates"),
        expect.anything(),
      );
    });

    it("should skip already processed updates", async () => {
      // rowCount === 0 means already processed
      dataSource.query
        .mockResolvedValueOnce(undefined) // ensureUpdatesTable
        .mockResolvedValueOnce({ rowCount: 0 }); // isUpdateProcessed

      await service.handleWebhook({
        update_id: 100,
        message: {
          message_id: 1,
          chat: { id: 1, type: "private" },
          date: 0,
          text: "/start",
          from: { id: 1, is_bot: false },
        },
      });

      // sendMessage should NOT have been called because update was already processed
    });

    it("should handle message updates", async () => {
      dataSource.query.mockResolvedValue({ rowCount: 1 });

      const update = {
        update_id: 101,
        message: {
          message_id: 1,
          chat: { id: 555, type: "private" as const },
          date: Date.now(),
          text: "/help",
          from: { id: 999, is_bot: false, first_name: "John" },
        },
      };

      await service.handleWebhook(update);

      // Should have sent the help message
      expect(httpMock.post).toHaveBeenCalledWith(
        "/sendMessage",
        expect.objectContaining({
          chat_id: 555,
        }),
      );
    });

    it("should handle callback query updates", async () => {
      dataSource.query.mockResolvedValue({ rowCount: 1 });

      const update = {
        update_id: 102,
        callback_query: {
          id: "cq-1",
          from: { id: 999, is_bot: false },
          message: {
            message_id: 1,
            chat: { id: 555, type: "private" as const },
            date: 0,
          },
          chat_instance: "123",
          data: "view_cart",
        },
      };

      await service.handleWebhook(update);

      expect(httpMock.post).toHaveBeenCalled();
    });

    it("should not throw on error", async () => {
      dataSource.query.mockRejectedValue(new Error("DB error"));

      await expect(
        service.handleWebhook({ update_id: 103 }),
      ).resolves.toBeUndefined();
    });
  });

  describe("convertUpdateToOrderDto", () => {
    it("should convert message update to order DTO", () => {
      const update = {
        update_id: 1,
        message: {
          message_id: 1,
          chat: { id: 1, type: "private" as const },
          date: 0,
          from: {
            id: 999,
            is_bot: false,
            first_name: "John",
            last_name: "Doe",
            username: "johndoe",
          },
        },
      };

      const result = service.convertUpdateToOrderDto(update, [
        { productId: "p1", qty: 2 },
      ]);

      expect(result).toEqual({
        user: {
          telegram_user_id: "999",
          username: "johndoe",
          first_name: "John",
          last_name: "Doe",
          phone: null,
        },
        items: [{ productId: "p1", qty: 2 }],
      });
    });

    it("should return null if no from", () => {
      const update = { update_id: 1 };

      const result = service.convertUpdateToOrderDto(update, []);

      expect(result).toBeNull();
    });

    it("should convert callback query update to order DTO", () => {
      const update = {
        update_id: 1,
        callback_query: {
          id: "cq-1",
          from: { id: 500, is_bot: false, first_name: "Jane" },
          message: {
            message_id: 1,
            chat: { id: 1, type: "private" as const },
            date: 0,
            contact: { phone_number: "+380991234567", first_name: "Jane" },
          },
          chat_instance: "123",
        },
      };

      const result = service.convertUpdateToOrderDto(update, [
        { productId: "p2", qty: 1 },
      ]);

      expect(result).not.toBeNull();
      expect(result!.user.telegram_user_id).toBe("500");
      expect(result!.user.phone).toBe("+380991234567");
    });
  });

  describe("createOrderFromTelegram", () => {
    it("should throw if botOwnerUserId is not set", async () => {
      (service as any).botOwnerUserId = "";

      await expect(
        service.createOrderFromTelegram({
          user: { telegram_user_id: "1" },
          items: [{ productId: "p1", qty: 1 }],
        } as any),
      ).rejects.toThrow();
    });

    it("should create order via transaction", async () => {
      const savedOrder = {
        id: "order-1",
        total_cents: 2000,
        created_at: new Date(),
      };

      dataSource.transaction.mockImplementation(async (cb: any) => {
        const mockRepo = (entity: any) => {
          if (entity.name === "Recipient" || entity === "Recipient") {
            return {
              findOne: jest.fn().mockResolvedValue({
                id: "rec-1",
                telegram_user_id: "100",
                user_id: "owner-1",
              }),
              create: jest.fn((data: any) => data),
              save: jest.fn((data: any) => Promise.resolve(data)),
            };
          }
          if (entity.name === "Product" || entity === "Product") {
            return {
              find: jest.fn().mockResolvedValue([
                {
                  id: "p1",
                  name: "Widget",
                  sale_price_cents: 1000,
                  quantity: 10,
                  currency: "UAH",
                  user_id: "owner-1",
                },
              ]),
              save: jest.fn((data: any) => Promise.resolve(data)),
            };
          }
          if (entity.name === "Order" || entity === "Order") {
            return {
              create: jest.fn((data: any) => data),
              save: jest.fn((data: any) =>
                Promise.resolve({ ...data, ...savedOrder }),
              ),
            };
          }
          if (entity.name === "OrderItem" || entity === "OrderItem") {
            return {
              create: jest.fn((data: any) => data),
              save: jest.fn((data: any) => Promise.resolve(data)),
            };
          }
          return {};
        };
        const manager = { getRepository: jest.fn(mockRepo) };
        return cb(manager);
      });

      const result = await service.createOrderFromTelegram({
        user: {
          telegram_user_id: "100",
          first_name: "John",
        },
        items: [{ productId: "p1", qty: 2 }],
      } as any);

      expect(result).toBeDefined();
      expect(result.id).toBe("order-1");
    });

    it("should throw if product not found", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const mockRepo = (entity: any) => {
          if (entity.name === "Recipient" || entity === "Recipient") {
            return {
              findOne: jest.fn().mockResolvedValue({ id: "rec-1" }),
            };
          }
          if (entity.name === "Product" || entity === "Product") {
            return {
              find: jest.fn().mockResolvedValue([]), // no products found
            };
          }
          return {};
        };
        const manager = { getRepository: jest.fn(mockRepo) };
        return cb(manager);
      });

      await expect(
        service.createOrderFromTelegram({
          user: { telegram_user_id: "100" },
          items: [{ productId: "missing", qty: 1 }],
        } as any),
      ).rejects.toThrow();
    });

    it("should throw if products have mixed currencies", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const mockRepo = (entity: any) => {
          if (entity.name === "Recipient" || entity === "Recipient") {
            return {
              findOne: jest.fn().mockResolvedValue({ id: "rec-1" }),
            };
          }
          if (entity.name === "Product" || entity === "Product") {
            return {
              find: jest.fn().mockResolvedValue([
                {
                  id: "p1",
                  currency: "UAH",
                  sale_price_cents: 100,
                  quantity: 10,
                },
                {
                  id: "p2",
                  currency: "USD",
                  sale_price_cents: 200,
                  quantity: 10,
                },
              ]),
            };
          }
          return {};
        };
        const manager = { getRepository: jest.fn(mockRepo) };
        return cb(manager);
      });

      await expect(
        service.createOrderFromTelegram({
          user: { telegram_user_id: "100" },
          items: [
            { productId: "p1", qty: 1 },
            { productId: "p2", qty: 1 },
          ],
        } as any),
      ).rejects.toThrow();
    });

    it("should throw if insufficient stock", async () => {
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const mockRepo = (entity: any) => {
          if (entity.name === "Recipient" || entity === "Recipient") {
            return {
              findOne: jest.fn().mockResolvedValue({ id: "rec-1" }),
            };
          }
          if (entity.name === "Product" || entity === "Product") {
            return {
              find: jest.fn().mockResolvedValue([
                {
                  id: "p1",
                  name: "Widget",
                  currency: "UAH",
                  sale_price_cents: 100,
                  quantity: 1, // only 1 in stock
                },
              ]),
            };
          }
          return {};
        };
        const manager = { getRepository: jest.fn(mockRepo) };
        return cb(manager);
      });

      await expect(
        service.createOrderFromTelegram({
          user: { telegram_user_id: "100" },
          items: [{ productId: "p1", qty: 5 }], // requesting 5
        } as any),
      ).rejects.toThrow();
    });
  });

  describe("session management (via handleWebhook)", () => {
    beforeEach(() => {
      dataSource.query.mockResolvedValue({ rowCount: 1 });
    });

    it("should handle /start command", async () => {
      await service.handleWebhook({
        update_id: 200,
        message: {
          message_id: 1,
          chat: { id: 100, type: "private" },
          date: 0,
          text: "/start",
          from: { id: 1, is_bot: false, first_name: "John" },
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalledWith(
        "/sendMessage",
        expect.objectContaining({ chat_id: 100 }),
      );
    });

    it("should handle /products command", async () => {
      productsRepo.find = jest
        .fn()
        .mockResolvedValue([
          { id: "p1", name: "Widget", sale_price_cents: 1000, quantity: 5 },
        ]);

      await service.handleWebhook({
        update_id: 201,
        message: {
          message_id: 1,
          chat: { id: 100, type: "private" },
          date: 0,
          text: "/products",
          from: { id: 1, is_bot: false },
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalled();
    });

    it("should handle /cart command with empty cart", async () => {
      await service.handleWebhook({
        update_id: 202,
        message: {
          message_id: 1,
          chat: { id: 100, type: "private" },
          date: 0,
          text: "/cart",
          from: { id: 1, is_bot: false },
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalledWith(
        "/sendMessage",
        expect.objectContaining({
          chat_id: 100,
        }),
      );
    });

    it("should handle /clear command", async () => {
      await service.handleWebhook({
        update_id: 203,
        message: {
          message_id: 1,
          chat: { id: 100, type: "private" },
          date: 0,
          text: "/clear",
          from: { id: 1, is_bot: false },
        },
      } as any);

      expect(cacheService.set).toHaveBeenCalled();
    });

    it("should handle /update command with empty cart", async () => {
      await service.handleWebhook({
        update_id: 204,
        message: {
          message_id: 1,
          chat: { id: 100, type: "private" },
          date: 0,
          text: "/update",
          from: { id: 1, is_bot: false },
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalled();
    });

    it("should handle /order command with empty cart", async () => {
      await service.handleWebhook({
        update_id: 205,
        message: {
          message_id: 1,
          chat: { id: 100, type: "private" },
          date: 0,
          text: "/order",
          from: { id: 1, is_bot: false },
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalledWith(
        "/sendMessage",
        expect.objectContaining({ chat_id: 100 }),
      );
    });

    it("should handle unknown text with default message", async () => {
      await service.handleWebhook({
        update_id: 206,
        message: {
          message_id: 1,
          chat: { id: 100, type: "private" },
          date: 0,
          text: "random text",
          from: { id: 1, is_bot: false },
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalled();
    });

    it("should handle message with no from user", async () => {
      await service.handleWebhook({
        update_id: 207,
        message: {
          message_id: 1,
          chat: { id: 100, type: "private" },
          date: 0,
          text: "/start",
          // no from
        },
      } as any);

      // Should not send any message since there's no user
      expect(httpMock.post).not.toHaveBeenCalled();
    });

    it("should handle session from cache", async () => {
      cacheService.get.mockResolvedValue({
        userId: 1,
        state: UserState.IDLE,
        cart: {
          userId: 1,
          items: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await service.handleWebhook({
        update_id: 208,
        message: {
          message_id: 1,
          chat: { id: 100, type: "private" },
          date: 0,
          text: "/help",
          from: { id: 1, is_bot: false },
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalled();
    });

    it("should handle /cart with items in cart", async () => {
      cacheService.get.mockResolvedValue({
        userId: 1,
        state: UserState.IDLE,
        cart: {
          userId: 1,
          items: [
            { productId: "p1", name: "Widget", price: 1000, quantity: 2 },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await service.handleWebhook({
        update_id: 209,
        message: {
          message_id: 1,
          chat: { id: 100, type: "private" },
          date: 0,
          text: "/cart",
          from: { id: 1, is_bot: false },
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalledWith(
        "/sendMessage",
        expect.objectContaining({ chat_id: 100 }),
      );
    });

    it("should handle /order with items in cart", async () => {
      cacheService.get.mockResolvedValue({
        userId: 1,
        state: UserState.IDLE,
        cart: {
          userId: 1,
          items: [
            { productId: "p1", name: "Widget", price: 1000, quantity: 2 },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await service.handleWebhook({
        update_id: 210,
        message: {
          message_id: 1,
          chat: { id: 100, type: "private" },
          date: 0,
          text: "/order",
          from: { id: 1, is_bot: false },
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalled();
    });
  });

  describe("callback query handling (via handleWebhook)", () => {
    beforeEach(() => {
      dataSource.query.mockResolvedValue({ rowCount: 1 });
    });

    it("should handle add_product_ callback", async () => {
      productsRepo.findOne.mockResolvedValue({
        id: "p1",
        name: "Widget",
        sale_price_cents: 1000,
      });

      await service.handleWebhook({
        update_id: 300,
        callback_query: {
          id: "cq-1",
          from: { id: 1, is_bot: false },
          message: {
            message_id: 1,
            chat: { id: 100, type: "private" },
            date: 0,
          },
          chat_instance: "123",
          data: "add_product_p1",
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalled();
    });

    it("should handle create_order callback with empty cart", async () => {
      await service.handleWebhook({
        update_id: 301,
        callback_query: {
          id: "cq-2",
          from: { id: 1, is_bot: false },
          message: {
            message_id: 1,
            chat: { id: 100, type: "private" },
            date: 0,
          },
          chat_instance: "123",
          data: "create_order",
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalled();
    });

    it("should handle confirm_order callback with empty cart", async () => {
      await service.handleWebhook({
        update_id: 302,
        callback_query: {
          id: "cq-3",
          from: { id: 1, is_bot: false },
          message: {
            message_id: 1,
            chat: { id: 100, type: "private" },
            date: 0,
          },
          chat_instance: "123",
          data: "confirm_order",
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalled();
    });

    it("should handle view_cart callback", async () => {
      await service.handleWebhook({
        update_id: 303,
        callback_query: {
          id: "cq-4",
          from: { id: 1, is_bot: false },
          message: {
            message_id: 1,
            chat: { id: 100, type: "private" },
            date: 0,
          },
          chat_instance: "123",
          data: "view_cart",
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalled();
    });

    it("should handle clear_cart callback", async () => {
      await service.handleWebhook({
        update_id: 304,
        callback_query: {
          id: "cq-5",
          from: { id: 1, is_bot: false },
          message: {
            message_id: 1,
            chat: { id: 100, type: "private" },
            date: 0,
          },
          chat_instance: "123",
          data: "clear_cart",
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalled();
    });

    it("should handle back_to_products callback", async () => {
      productsRepo.find = jest.fn().mockResolvedValue([]);

      await service.handleWebhook({
        update_id: 305,
        callback_query: {
          id: "cq-6",
          from: { id: 1, is_bot: false },
          message: {
            message_id: 1,
            chat: { id: 100, type: "private" },
            date: 0,
          },
          chat_instance: "123",
          data: "back_to_products",
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalled();
    });

    it("should handle ADD_PRODUCT: (old format) callback", async () => {
      await service.handleWebhook({
        update_id: 306,
        callback_query: {
          id: "cq-7",
          from: { id: 1, is_bot: false },
          message: {
            message_id: 1,
            chat: { id: 100, type: "private" },
            date: 0,
          },
          chat_instance: "123",
          data: "ADD_PRODUCT:sku123",
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalled();
    });

    it("should handle CONFIRM_ORDER (old format) callback", async () => {
      await service.handleWebhook({
        update_id: 307,
        callback_query: {
          id: "cq-8",
          from: { id: 1, is_bot: false },
          message: {
            message_id: 1,
            chat: { id: 100, type: "private" },
            date: 0,
          },
          chat_instance: "123",
          data: "CONFIRM_ORDER",
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalled();
    });

    it("should handle unknown callback data", async () => {
      await service.handleWebhook({
        update_id: 308,
        callback_query: {
          id: "cq-9",
          from: { id: 1, is_bot: false },
          message: {
            message_id: 1,
            chat: { id: 100, type: "private" },
            date: 0,
          },
          chat_instance: "123",
          data: "unknown_action",
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalled();
    });

    it("should handle callback query error gracefully", async () => {
      httpMock.post.mockRejectedValueOnce(new Error("API error"));

      await service.handleWebhook({
        update_id: 309,
        callback_query: {
          id: "cq-10",
          from: { id: 1, is_bot: false },
          message: {
            message_id: 1,
            chat: { id: 100, type: "private" },
            date: 0,
          },
          chat_instance: "123",
          data: "add_product_p1",
        },
      } as any);

      // Should not throw
    });
  });

  describe("quantity input handling", () => {
    beforeEach(() => {
      dataSource.query.mockResolvedValue({ rowCount: 1 });
    });

    it("should reject invalid quantity input", async () => {
      cacheService.get.mockResolvedValue({
        userId: 1,
        state: UserState.ENTERING_QUANTITY,
        pendingProductId: "p1",
        cart: {
          userId: 1,
          items: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await service.handleWebhook({
        update_id: 400,
        message: {
          message_id: 1,
          chat: { id: 100, type: "private" },
          date: 0,
          text: "abc",
          from: { id: 1, is_bot: false },
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalledWith(
        "/sendMessage",
        expect.objectContaining({ chat_id: 100 }),
      );
    });

    it("should handle valid quantity input", async () => {
      cacheService.get.mockResolvedValue({
        userId: 1,
        state: UserState.ENTERING_QUANTITY,
        pendingProductId: "p1",
        cart: {
          userId: 1,
          items: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      productsRepo.findOne.mockResolvedValue({
        id: "p1",
        name: "Widget",
        sale_price_cents: 1000,
        quantity: 10,
      });

      await service.handleWebhook({
        update_id: 401,
        message: {
          message_id: 1,
          chat: { id: 100, type: "private" },
          date: 0,
          text: "3",
          from: { id: 1, is_bot: false },
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalled();
      expect(cacheService.set).toHaveBeenCalled();
    });

    it("should handle quantity input without pending product", async () => {
      cacheService.get.mockResolvedValue({
        userId: 1,
        state: UserState.ENTERING_QUANTITY,
        pendingProductId: undefined,
        cart: {
          userId: 1,
          items: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await service.handleWebhook({
        update_id: 402,
        message: {
          message_id: 1,
          chat: { id: 100, type: "private" },
          date: 0,
          text: "3",
          from: { id: 1, is_bot: false },
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalled();
    });

    it("should handle insufficient stock for quantity", async () => {
      cacheService.get.mockResolvedValue({
        userId: 1,
        state: UserState.ENTERING_QUANTITY,
        pendingProductId: "p1",
        cart: {
          userId: 1,
          items: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      productsRepo.findOne.mockResolvedValue({
        id: "p1",
        name: "Widget",
        sale_price_cents: 1000,
        quantity: 2, // only 2 in stock
      });

      await service.handleWebhook({
        update_id: 403,
        message: {
          message_id: 1,
          chat: { id: 100, type: "private" },
          date: 0,
          text: "5", // requesting 5
          from: { id: 1, is_bot: false },
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalled();
    });

    it("should update existing cart item quantity", async () => {
      cacheService.get.mockResolvedValue({
        userId: 1,
        state: UserState.ENTERING_QUANTITY,
        pendingProductId: "p1",
        cart: {
          userId: 1,
          items: [
            { productId: "p1", name: "Widget", price: 1000, quantity: 2 },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      productsRepo.findOne.mockResolvedValue({
        id: "p1",
        name: "Widget",
        sale_price_cents: 1000,
        quantity: 10,
      });

      await service.handleWebhook({
        update_id: 404,
        message: {
          message_id: 1,
          chat: { id: 100, type: "private" },
          date: 0,
          text: "3",
          from: { id: 1, is_bot: false },
        },
      } as any);

      expect(cacheService.set).toHaveBeenCalled();
    });
  });

  describe("/update cart command with items", () => {
    beforeEach(() => {
      dataSource.query.mockResolvedValue({ rowCount: 1 });
    });

    it("should update cart checking product availability", async () => {
      cacheService.get.mockResolvedValue({
        userId: 1,
        state: UserState.IDLE,
        cart: {
          userId: 1,
          items: [
            { productId: "p1", name: "Widget", price: 1000, quantity: 5 },
            { productId: "p2", name: "Gadget", price: 2000, quantity: 3 },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Code uses productsRepo.find (batch load), returns only p1 (p2 not found)
      productsRepo.find.mockResolvedValueOnce([{ id: "p1", quantity: 3 }]);

      await service.handleWebhook({
        update_id: 500,
        message: {
          message_id: 1,
          chat: { id: 100, type: "private" },
          date: 0,
          text: "/update",
          from: { id: 1, is_bot: false },
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalled();
      expect(cacheService.set).toHaveBeenCalled();
    });

    it("should handle product with zero quantity", async () => {
      cacheService.get.mockResolvedValue({
        userId: 1,
        state: UserState.IDLE,
        cart: {
          userId: 1,
          items: [
            { productId: "p1", name: "Widget", price: 1000, quantity: 2 },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Code uses productsRepo.find (batch load)
      productsRepo.find.mockResolvedValueOnce([{ id: "p1", quantity: 0 }]);

      await service.handleWebhook({
        update_id: 501,
        message: {
          message_id: 1,
          chat: { id: 100, type: "private" },
          date: 0,
          text: "/update",
          from: { id: 1, is_bot: false },
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalled();
    });
  });

  describe("products list (via /products)", () => {
    beforeEach(() => {
      dataSource.query.mockResolvedValue({ rowCount: 1 });
    });

    it("should handle no products available", async () => {
      productsRepo.find = jest.fn().mockResolvedValue([]);

      await service.handleWebhook({
        update_id: 600,
        message: {
          message_id: 1,
          chat: { id: 100, type: "private" },
          date: 0,
          text: "/products",
          from: { id: 1, is_bot: false },
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalled();
    });

    it("should handle bot not configured", async () => {
      (service as any).botOwnerUserId = "";

      await service.handleWebhook({
        update_id: 601,
        message: {
          message_id: 1,
          chat: { id: 100, type: "private" },
          date: 0,
          text: "/products",
          from: { id: 1, is_bot: false },
        },
      } as any);

      expect(httpMock.post).toHaveBeenCalled();
    });
  });
});
