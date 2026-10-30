import { Test, TestingModule } from "@nestjs/testing";
import { getDataSourceToken } from "@nestjs/typeorm";
import { OrdersDashboardService } from "./orders-dashboard.service";
import { CacheService } from "../../common/services/cache.service";
import { User } from "../users/entities/user.entity";

describe("OrdersDashboardService", () => {
  let service: OrdersDashboardService;
  let dataSource: any;
  let cacheService: any;
  const mockUser = { id: "user-1" } as User;

  beforeEach(async () => {
    dataSource = {
      query: jest.fn(),
    };
    cacheService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersDashboardService,
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    service = module.get<OrdersDashboardService>(OrdersDashboardService);
  });

  describe("dashboard methods", () => {
    it("getOrderStatusSummary should return status counts", async () => {
      dataSource.query.mockResolvedValue([
        { status: "draft", count: 5 },
        { status: "confirmed", count: 10 },
        { status: "cancelled", count: 2 },
      ]);

      const result = await service.getOrderStatusSummary(mockUser);

      expect(result).toEqual({ draft: 5, confirmed: 10, cancelled: 2 });
    });

    it("getOrderStatusSummary should return zeros when no data", async () => {
      dataSource.query.mockResolvedValue([]);

      const result = await service.getOrderStatusSummary(mockUser);

      expect(result).toEqual({ draft: 0, confirmed: 0, cancelled: 0 });
    });

    it("getTotalRevenue should return revenue data", async () => {
      dataSource.query.mockResolvedValue([
        {
          total_revenue_cents: "150000",
          total_orders: "15",
          currency: "UAH",
        },
      ]);

      const result = await service.getTotalRevenue(mockUser);

      expect(result.total_revenue_cents).toBe(150000);
      expect(result.total_orders).toBe(15);
      expect(result.currency).toBe("UAH");
    });

    it("getTotalRevenue should return defaults when no data", async () => {
      dataSource.query.mockResolvedValue([]);

      const result = await service.getTotalRevenue(mockUser);

      expect(result.total_revenue_cents).toBe(0);
      expect(result.total_orders).toBe(0);
      expect(result.currency).toBe("UAH");
    });

    it("getTotalRevenue keeps an unknown profit null and reports what was excluded", async () => {
      dataSource.query.mockResolvedValue([
        {
          total_revenue_cents: null,
          total_orders: "2",
          currency: "UAH",
          unknown_cost_lines: "3",
          unknown_cost_turnover_cents: "4500",
        },
      ]);

      const result = await service.getTotalRevenue(mockUser);

      expect(result).toEqual({
        total_revenue_cents: null,
        total_orders: 2,
        currency: "UAH",
        unknown_cost_lines: 3,
        unknown_cost_turnover_cents: 4500,
        profit_complete: false,
      });
    });

    it("getTotalRevenue with no confirmed lines is a complete zero", async () => {
      dataSource.query.mockResolvedValue([]);

      expect(await service.getTotalRevenue(mockUser)).toEqual({
        total_revenue_cents: 0,
        total_orders: 0,
        currency: "UAH",
        unknown_cost_lines: 0,
        unknown_cost_turnover_cents: 0,
        profit_complete: true,
      });
    });

    it("profit queries read the line snapshot, never the product's current cost", async () => {
      dataSource.query.mockResolvedValue([]);

      await service.getRevenueByProducts(mockUser);
      await service.getRevenueByRecipients(mockUser);
      await service.getTotalRevenue(mockUser);
      await service.getDailyRevenue(mockUser, 7);

      for (const [sql] of dataSource.query.mock.calls) {
        expect(sql).toContain("oi.unit_cost_cents");
        expect(sql).not.toContain("purchase_price_cents");
        expect(sql).not.toMatch(/JOIN products/);
      }
    });

    it("dashboard cache keys carry the payload version", async () => {
      dataSource.query.mockResolvedValue([]);

      await service.getTotalRevenue(mockUser);

      expect(cacheService.get).toHaveBeenCalledWith(
        "dashboard:v2:totalRevenue:user-1:[null,null]",
      );
    });

    it("getDailyRevenue keeps a null day null and an empty day zero", async () => {
      dataSource.query.mockResolvedValue([
        {
          date: "2025-01-01",
          revenue_cents: 0,
          turnover_cents: 0,
          unknown_cost_lines: "0",
          unknown_cost_turnover_cents: "0",
        },
        {
          date: "2025-01-02",
          revenue_cents: null,
          turnover_cents: 2600,
          unknown_cost_lines: "1",
          unknown_cost_turnover_cents: "2600",
        },
      ]);

      const [empty, unknown] = await service.getDailyRevenue(mockUser, 2);

      expect(empty).toMatchObject({ revenue_cents: 0, profit_complete: true });
      expect(unknown).toMatchObject({
        revenue_cents: null,
        turnover_cents: 2600,
        unknown_cost_lines: 1,
        unknown_cost_turnover_cents: 2600,
        profit_complete: false,
      });
    });

    it("getTotalTurnover should return turnover data", async () => {
      dataSource.query.mockResolvedValue([
        {
          total_turnover_cents: "200000",
          total_orders: "20",
          currency: "UAH",
        },
      ]);

      const result = await service.getTotalTurnover(mockUser);

      expect(result.total_turnover_cents).toBe(200000);
      expect(result.total_orders).toBe(20);
    });

    it("getDailyRevenue should return daily data", async () => {
      dataSource.query.mockResolvedValue([
        { date: "2025-01-01", revenue_cents: "5000", turnover_cents: "10000" },
      ]);

      const result = await service.getDailyRevenue(mockUser, 7);

      expect(result).toHaveLength(1);
      expect(result[0].revenue_cents).toBe(5000);
      expect(result[0].turnover_cents).toBe(10000);
    });

    it("should use cache for dashboard methods", async () => {
      cacheService.get.mockResolvedValue({
        draft: 1,
        confirmed: 2,
        cancelled: 0,
      });

      const result = await service.getOrderStatusSummary(mockUser);

      expect(result).toEqual({ draft: 1, confirmed: 2, cancelled: 0 });
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it("getRevenueByProducts should return product revenue", async () => {
      dataSource.query.mockResolvedValue([
        {
          product_id: "p1",
          product_name: "Widget",
          total_revenue_cents: "5000",
          total_quantity: "10",
          currency: "UAH",
        },
      ]);

      const result = await service.getRevenueByProducts(mockUser);

      expect(result).toHaveLength(1);
      expect(result[0].product_name).toBe("Widget");
      expect(result[0].total_revenue_cents).toBe(5000);
    });

    it("getRevenueByRecipients should return recipient revenue", async () => {
      dataSource.query.mockResolvedValue([
        {
          recipient_id: "r1",
          recipient_name: "John",
          total_revenue_cents: "8000",
          total_orders: "3",
          currency: "UAH",
        },
      ]);

      const result = await service.getRevenueByRecipients(mockUser);

      expect(result).toHaveLength(1);
      expect(result[0].recipient_name).toBe("John");
    });

    it("getTurnoverByProducts should return product turnover", async () => {
      dataSource.query.mockResolvedValue([
        {
          product_id: "p1",
          product_name: "Widget",
          total_turnover_cents: "15000",
          total_quantity: "10",
          currency: "UAH",
        },
      ]);

      const result = await service.getTurnoverByProducts(mockUser);

      expect(result).toHaveLength(1);
      expect(result[0].total_turnover_cents).toBe(15000);
    });

    it("getTurnoverByRecipients should return recipient turnover", async () => {
      dataSource.query.mockResolvedValue([
        {
          recipient_id: "r1",
          recipient_name: "John",
          total_turnover_cents: "20000",
          total_orders: "5",
          currency: "UAH",
        },
      ]);

      const result = await service.getTurnoverByRecipients(mockUser);

      expect(result).toHaveLength(1);
      expect(result[0].total_turnover_cents).toBe(20000);
    });

    it("getRevenueByProducts should pass date filters", async () => {
      dataSource.query.mockResolvedValue([]);
      const start = new Date("2025-01-01");
      const end = new Date("2025-12-31");

      await service.getRevenueByProducts(mockUser, start, end);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("created_at >="),
        expect.arrayContaining([start, end]),
      );
    });

    it("getRevenueByRecipients should pass date filters", async () => {
      dataSource.query.mockResolvedValue([]);

      await service.getRevenueByRecipients(
        mockUser,
        new Date("2025-01-01"),
        new Date("2025-12-31"),
      );

      expect(dataSource.query).toHaveBeenCalled();
    });

    it("getTotalRevenue should pass date filters", async () => {
      dataSource.query.mockResolvedValue([]);

      await service.getTotalRevenue(
        mockUser,
        new Date("2025-01-01"),
        new Date("2025-12-31"),
      );

      expect(dataSource.query).toHaveBeenCalled();
    });

    it("getTurnoverByProducts should pass date filters", async () => {
      dataSource.query.mockResolvedValue([]);

      await service.getTurnoverByProducts(
        mockUser,
        new Date("2025-01-01"),
        new Date("2025-12-31"),
      );

      expect(dataSource.query).toHaveBeenCalled();
    });

    it("getTurnoverByRecipients should pass date filters", async () => {
      dataSource.query.mockResolvedValue([]);

      await service.getTurnoverByRecipients(
        mockUser,
        new Date("2025-01-01"),
        new Date("2025-12-31"),
      );

      expect(dataSource.query).toHaveBeenCalled();
    });

    it("getTotalTurnover should pass date filters", async () => {
      dataSource.query.mockResolvedValue([]);

      await service.getTotalTurnover(
        mockUser,
        new Date("2025-01-01"),
        new Date("2025-12-31"),
      );

      expect(dataSource.query).toHaveBeenCalled();
    });

    it("getTotalTurnover should return defaults when no data", async () => {
      dataSource.query.mockResolvedValue([]);

      const result = await service.getTotalTurnover(mockUser);

      expect(result).toEqual({
        total_turnover_cents: 0,
        total_orders: 0,
        currency: "UAH",
      });
    });
  });
});
