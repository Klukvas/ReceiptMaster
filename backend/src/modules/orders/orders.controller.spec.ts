import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { User } from "../users/entities/user.entity";
import { HttpStatus } from "@nestjs/common";

describe("OrdersController", () => {
  let controller: OrdersController;
  let ordersService: jest.Mocked<OrdersService>;
  const mockUser = { id: "user-1" } as User;
  const mockReq = { user: mockUser };

  const mockOrder = {
    id: "order-1",
    recipient_id: "rec-1",
    status: "draft",
    total_cents: 5000,
    user_id: "user-1",
  };

  beforeEach(() => {
    ordersService = {
      create: jest.fn(),
      findAll: jest.fn().mockResolvedValue({
        data: [mockOrder],
        total: 1,
        offset: 0,
        limit: 10,
      }),
      findOne: jest.fn().mockResolvedValue(mockOrder),
      confirm: jest
        .fn()
        .mockResolvedValue({ ...mockOrder, status: "confirmed" }),
      cancel: jest
        .fn()
        .mockResolvedValue({ ...mockOrder, status: "cancelled" }),
      update: jest.fn().mockResolvedValue(mockOrder),
      remove: jest.fn().mockResolvedValue(undefined),
      approveBatch: jest.fn().mockResolvedValue({ approved: 2 }),
      deleteBatch: jest.fn().mockResolvedValue({ deleted: 2 }),
      getDailyRevenue: jest.fn().mockResolvedValue([]),
      getOrderStatusSummary: jest
        .fn()
        .mockResolvedValue({ draft: 5, confirmed: 10, cancelled: 2 }),
      getRevenueByProducts: jest.fn().mockResolvedValue([]),
      getRevenueByRecipients: jest.fn().mockResolvedValue([]),
      getTotalRevenue: jest.fn().mockResolvedValue({
        total_revenue_cents: 0,
        total_orders: 0,
        currency: "UAH",
      }),
      getTurnoverByProducts: jest.fn().mockResolvedValue([]),
      getTurnoverByRecipients: jest.fn().mockResolvedValue([]),
      getTotalTurnover: jest.fn().mockResolvedValue({
        total_turnover_cents: 0,
        total_orders: 0,
        currency: "UAH",
      }),
    } as any;

    controller = new OrdersController(ordersService);
  });

  describe("create", () => {
    it("should create an order and return with status code", async () => {
      ordersService.create.mockResolvedValue({
        statusCode: HttpStatus.CREATED,
        data: mockOrder,
        isFromCache: false,
      });

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
      } as any;

      await controller.create(
        { recipientId: "rec-1", items: [] } as any,
        mockReq,
        undefined,
        mockRes,
      );

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(mockRes.json).toHaveBeenCalledWith(mockOrder);
    });

    it("should set idempotency header when cached", async () => {
      ordersService.create.mockResolvedValue({
        statusCode: HttpStatus.OK,
        data: mockOrder,
        isFromCache: true,
      });

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
      } as any;

      await controller.create(
        { recipientId: "rec-1", items: [] } as any,
        mockReq,
        "idem-key-123",
        mockRes,
      );

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        "X-Idempotency-Replayed",
        "true",
      );
    });
  });

  describe("batchApprove", () => {
    it("should approve multiple orders", async () => {
      const result = await controller.batchApprove(
        { orderIds: ["o1", "o2"] },
        mockReq,
      );

      expect(ordersService.approveBatch).toHaveBeenCalledWith(
        ["o1", "o2"],
        mockUser,
      );
      expect(result).toEqual({ approved: 2 });
    });
  });

  describe("batchDelete", () => {
    it("should delete multiple orders", async () => {
      const result = await controller.batchDelete(
        { orderIds: ["o1", "o2"] },
        mockReq,
      );

      expect(ordersService.deleteBatch).toHaveBeenCalledWith(
        ["o1", "o2"],
        mockUser,
      );
      expect(result).toEqual({ deleted: 2 });
    });
  });

  describe("findAll", () => {
    it("should return paginated orders", async () => {
      const pagination = { limit: 10, offset: 0 };
      const dateRange = {
        startDateParsed: undefined,
        endDateParsed: undefined,
      } as any;

      const result = await controller.findAll(
        pagination as any,
        dateRange,
        mockReq,
      );

      expect(ordersService.findAll).toHaveBeenCalled();
      expect(result.data).toHaveLength(1);
    });

    it("should pass filters to service", async () => {
      const pagination = { limit: 10, offset: 0 };
      const dateRange = {
        startDateParsed: new Date("2025-01-01"),
        endDateParsed: new Date("2025-12-31"),
      } as any;

      await controller.findAll(
        pagination as any,
        dateRange,
        mockReq,
        "confirmed" as any,
        "1000",
        "5000",
      );

      expect(ordersService.findAll).toHaveBeenCalledWith(
        pagination,
        mockUser,
        "confirmed",
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date),
          minAmount: 1000,
          maxAmount: 5000,
        }),
      );
    });
  });

  describe("findOne", () => {
    it("should find an order by id", () => {
      controller.findOne("order-1", mockReq);

      expect(ordersService.findOne).toHaveBeenCalledWith("order-1", mockUser);
    });
  });

  describe("confirm", () => {
    it("should confirm an order", () => {
      controller.confirm("order-1", mockReq);

      expect(ordersService.confirm).toHaveBeenCalledWith("order-1", mockUser);
    });
  });

  describe("cancel", () => {
    it("should cancel an order", () => {
      controller.cancel("order-1", mockReq);

      expect(ordersService.cancel).toHaveBeenCalledWith("order-1", mockUser);
    });
  });

  describe("update", () => {
    it("should update an order", () => {
      const dto = { recipientId: "rec-2" } as any;

      controller.update("order-1", dto, mockReq);

      expect(ordersService.update).toHaveBeenCalledWith(
        "order-1",
        dto,
        mockUser,
      );
    });
  });

  describe("remove", () => {
    it("should remove an order", () => {
      controller.remove("order-1", mockReq);

      expect(ordersService.remove).toHaveBeenCalledWith("order-1", mockUser);
    });
  });

  describe("dashboard endpoints", () => {
    it("getDailyRevenue should pass days param", () => {
      controller.getDailyRevenue(mockReq, "14");

      expect(ordersService.getDailyRevenue).toHaveBeenCalledWith(mockUser, 14);
    });

    it("getDailyRevenue should default to 7 days", () => {
      controller.getDailyRevenue(mockReq, undefined);

      expect(ordersService.getDailyRevenue).toHaveBeenCalledWith(mockUser, 7);
    });

    it("getOrderStatusSummary should work", () => {
      controller.getOrderStatusSummary(mockReq);

      expect(ordersService.getOrderStatusSummary).toHaveBeenCalledWith(
        mockUser,
      );
    });

    it("getRevenueByProducts should pass date range", () => {
      const dateRange = {
        startDateParsed: new Date("2025-01-01"),
        endDateParsed: new Date("2025-12-31"),
      } as any;

      controller.getRevenueByProducts(mockReq, dateRange);

      expect(ordersService.getRevenueByProducts).toHaveBeenCalledWith(
        mockUser,
        dateRange.startDateParsed,
        dateRange.endDateParsed,
      );
    });

    it("getTotalRevenue should work", () => {
      const dateRange = {
        startDateParsed: undefined,
        endDateParsed: undefined,
      } as any;

      controller.getTotalRevenue(mockReq, dateRange);

      expect(ordersService.getTotalRevenue).toHaveBeenCalledWith(
        mockUser,
        undefined,
        undefined,
      );
    });

    it("getTotalTurnover should work", () => {
      const dateRange = {
        startDateParsed: undefined,
        endDateParsed: undefined,
      } as any;

      controller.getTotalTurnover(mockReq, dateRange);

      expect(ordersService.getTotalTurnover).toHaveBeenCalledWith(
        mockUser,
        undefined,
        undefined,
      );
    });
  });
});
