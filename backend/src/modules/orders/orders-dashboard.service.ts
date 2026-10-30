import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { OrderStatus } from "./entities/order.entity";
import { CacheService } from "../../common/services/cache.service";
import { User } from "../users/entities/user.entity";
import {
  DASHBOARD_CACHE_TTL_SECONDS,
  dashboardCacheKey,
} from "./dashboard-cache";
import {
  EMPTY_PROFIT_COMPLETENESS,
  KNOWN_COST_PROFIT_SQL,
  UNKNOWN_COST_COLUMNS_SQL,
  nullableCents,
  profitCompleteness,
} from "./dashboard-profit";
import {
  DailyRevenueDto,
  RevenueByProductDto,
  RevenueByRecipientDto,
  TotalRevenueDto,
} from "./dto/dashboard-response.dto";

/**
 * Cached dashboard aggregates over confirmed orders. Read-only: OrdersService
 * (and the Telegram order path) invalidate these entries on every order write.
 */
@Injectable()
export class OrdersDashboardService {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
    private cacheService: CacheService,
  ) {}

  private async cachedDashboard<T>(
    key: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.cacheService.get<T>(key);
    if (cached) return cached;
    const result = await fn();
    await this.cacheService.set(key, result, DASHBOARD_CACHE_TTL_SECONDS);
    return result;
  }

  async getRevenueByProducts(
    user: User,
    startDate?: Date,
    endDate?: Date,
  ): Promise<RevenueByProductDto[]> {
    const cacheKey = dashboardCacheKey(
      "revenueByProducts",
      user.id,
      startDate,
      endDate,
    );
    return this.cachedDashboard(cacheKey, async () => {
      let query = `
      SELECT
        oi.product_id,
        oi.product_name,
        ${KNOWN_COST_PROFIT_SQL} as total_revenue_cents,
        SUM(oi.qty) as total_quantity,
        o.currency,${UNKNOWN_COST_COLUMNS_SQL}
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi.order_id
      WHERE o.status = $1 AND o.user_id = $2 AND o.deleted_at IS NULL
    `;

      const params: any[] = [OrderStatus.CONFIRMED, user.id];
      let paramIndex = 3;

      if (startDate) {
        query += ` AND o.created_at >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        query += ` AND o.created_at <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }

      query += `
      GROUP BY oi.product_id, oi.product_name, o.currency
      ORDER BY total_revenue_cents DESC NULLS LAST
    `;

      const results = await this.dataSource.query(query, params);

      return results.map((row) => ({
        product_id: row.product_id,
        product_name: row.product_name,
        total_revenue_cents: nullableCents(row.total_revenue_cents),
        total_quantity: parseInt(row.total_quantity) || 0,
        currency: row.currency,
        ...profitCompleteness(row),
      }));
    });
  }

  async getRevenueByRecipients(
    user: User,
    startDate?: Date,
    endDate?: Date,
  ): Promise<RevenueByRecipientDto[]> {
    const cacheKey = dashboardCacheKey(
      "revenueByRecipients",
      user.id,
      startDate,
      endDate,
    );
    return this.cachedDashboard(cacheKey, async () => {
      let query = `
      SELECT
        o.recipient_id,
        r.name as recipient_name,
        ${KNOWN_COST_PROFIT_SQL} as total_revenue_cents,
        COUNT(DISTINCT o.id) as total_orders,
        o.currency,${UNKNOWN_COST_COLUMNS_SQL}
      FROM orders o
      INNER JOIN recipients r ON r.id = o.recipient_id
      INNER JOIN order_items oi ON oi.order_id = o.id
      WHERE o.status = $1 AND o.user_id = $2 AND o.deleted_at IS NULL
    `;

      const params: any[] = [OrderStatus.CONFIRMED, user.id];
      let paramIndex = 3;

      if (startDate) {
        query += ` AND o.created_at >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        query += ` AND o.created_at <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }

      query += `
      GROUP BY o.recipient_id, r.name, o.currency
      ORDER BY total_revenue_cents DESC NULLS LAST
    `;

      const results = await this.dataSource.query(query, params);

      return results.map((row) => ({
        recipient_id: row.recipient_id,
        recipient_name: row.recipient_name,
        total_revenue_cents: nullableCents(row.total_revenue_cents),
        total_orders: parseInt(row.total_orders) || 0,
        currency: row.currency,
        ...profitCompleteness(row),
      }));
    });
  }

  async getTotalRevenue(
    user: User,
    startDate?: Date,
    endDate?: Date,
  ): Promise<TotalRevenueDto> {
    const cacheKey = dashboardCacheKey(
      "totalRevenue",
      user.id,
      startDate,
      endDate,
    );
    return this.cachedDashboard(cacheKey, async () => {
      let query = `
      SELECT
        ${KNOWN_COST_PROFIT_SQL} as total_revenue_cents,
        COUNT(DISTINCT o.id) as total_orders,
        o.currency,${UNKNOWN_COST_COLUMNS_SQL}
      FROM orders o
      INNER JOIN order_items oi ON oi.order_id = o.id
      WHERE o.status = $1 AND o.user_id = $2 AND o.deleted_at IS NULL
    `;

      const params: any[] = [OrderStatus.CONFIRMED, user.id];
      let paramIndex = 3;

      if (startDate) {
        query += ` AND o.created_at >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        query += ` AND o.created_at <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }

      query += ` GROUP BY o.currency`;

      const results = await this.dataSource.query(query, params);
      const result = results[0];
      // No confirmed lines at all is a complete zero; otherwise NULL stays unknown.
      if (!result)
        return {
          total_revenue_cents: 0,
          total_orders: 0,
          currency: "UAH",
          ...EMPTY_PROFIT_COMPLETENESS,
        };

      return {
        total_revenue_cents: nullableCents(result.total_revenue_cents),
        total_orders: parseInt(result.total_orders) || 0,
        currency: result.currency || "UAH",
        ...profitCompleteness(result),
      };
    });
  }

  // Методы для общего оборота (общая выручка без вычета себестоимости)
  async getTurnoverByProducts(
    user: User,
    startDate?: Date,
    endDate?: Date,
  ): Promise<
    Array<{
      product_id: string;
      product_name: string;
      total_turnover_cents: number;
      total_quantity: number;
      currency: string;
    }>
  > {
    const cacheKey = dashboardCacheKey(
      "turnoverByProducts",
      user.id,
      startDate,
      endDate,
    );
    return this.cachedDashboard(cacheKey, async () => {
      let query = `
      SELECT
        oi.product_id,
        oi.product_name,
        SUM(oi.line_total_cents) as total_turnover_cents,
        SUM(oi.qty) as total_quantity,
        o.currency
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi.order_id
      WHERE o.status = $1 AND o.user_id = $2 AND o.deleted_at IS NULL
    `;

      const params: any[] = [OrderStatus.CONFIRMED, user.id];
      let paramIndex = 3;

      if (startDate) {
        query += ` AND o.created_at >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        query += ` AND o.created_at <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }

      query += `
      GROUP BY oi.product_id, oi.product_name, o.currency
      ORDER BY total_turnover_cents DESC
    `;

      const results = await this.dataSource.query(query, params);

      return results.map((row) => ({
        product_id: row.product_id,
        product_name: row.product_name,
        total_turnover_cents: parseInt(row.total_turnover_cents) || 0,
        total_quantity: parseInt(row.total_quantity) || 0,
        currency: row.currency,
      }));
    });
  }

  async getTurnoverByRecipients(
    user: User,
    startDate?: Date,
    endDate?: Date,
  ): Promise<
    Array<{
      recipient_id: string;
      recipient_name: string;
      total_turnover_cents: number;
      total_orders: number;
      currency: string;
    }>
  > {
    const cacheKey = dashboardCacheKey(
      "turnoverByRecipients",
      user.id,
      startDate,
      endDate,
    );
    return this.cachedDashboard(cacheKey, async () => {
      let query = `
      SELECT
        o.recipient_id,
        r.name as recipient_name,
        SUM(o.total_cents) as total_turnover_cents,
        COUNT(o.id) as total_orders,
        o.currency
      FROM orders o
      INNER JOIN recipients r ON r.id = o.recipient_id
      WHERE o.status = $1 AND o.user_id = $2 AND o.deleted_at IS NULL
    `;

      const params: any[] = [OrderStatus.CONFIRMED, user.id];
      let paramIndex = 3;

      if (startDate) {
        query += ` AND o.created_at >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        query += ` AND o.created_at <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }

      query += `
      GROUP BY o.recipient_id, r.name, o.currency
      ORDER BY total_turnover_cents DESC
    `;

      const results = await this.dataSource.query(query, params);

      return results.map((row) => ({
        recipient_id: row.recipient_id,
        recipient_name: row.recipient_name,
        total_turnover_cents: parseInt(row.total_turnover_cents) || 0,
        total_orders: parseInt(row.total_orders) || 0,
        currency: row.currency,
      }));
    });
  }

  async getTotalTurnover(
    user: User,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    total_turnover_cents: number;
    total_orders: number;
    currency: string;
  }> {
    const cacheKey = dashboardCacheKey(
      "totalTurnover",
      user.id,
      startDate,
      endDate,
    );
    return this.cachedDashboard(cacheKey, async () => {
      let query = `
      SELECT
        SUM(o.total_cents) as total_turnover_cents,
        COUNT(o.id) as total_orders,
        o.currency
      FROM orders o
      WHERE o.status = $1 AND o.user_id = $2 AND o.deleted_at IS NULL
    `;

      const params: any[] = [OrderStatus.CONFIRMED, user.id];
      let paramIndex = 3;

      if (startDate) {
        query += ` AND o.created_at >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        query += ` AND o.created_at <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }

      query += ` GROUP BY o.currency`;

      const results = await this.dataSource.query(query, params);
      const result = results[0];

      return {
        total_turnover_cents: result
          ? parseInt(result.total_turnover_cents) || 0
          : 0,
        total_orders: result ? parseInt(result.total_orders) || 0 : 0,
        currency: result?.currency || "UAH",
      };
    });
  }

  async getDailyRevenue(
    user: User,
    days: number = 7,
  ): Promise<DailyRevenueDto[]> {
    const cacheKey = dashboardCacheKey("dailyRevenue", user.id, days);
    return this.cachedDashboard(cacheKey, async () => {
      const results = await this.dataSource.query(
        `
      SELECT
        d.date::text as date,
        (CASE WHEN COUNT(oi.id) = 0 THEN 0
          ELSE ${KNOWN_COST_PROFIT_SQL} END)::integer as revenue_cents,
        COALESCE(SUM(oi.line_total_cents), 0)::integer as turnover_cents,${UNKNOWN_COST_COLUMNS_SQL}
      FROM generate_series(
        CURRENT_DATE - ($1 - 1) * INTERVAL '1 day',
        CURRENT_DATE,
        '1 day'
      ) AS d(date)
      LEFT JOIN orders o ON DATE(o.created_at) = d.date
        AND o.status = 'confirmed'
        AND o.user_id = $2
        AND o.deleted_at IS NULL
      LEFT JOIN order_items oi ON oi.order_id = o.id
      GROUP BY d.date
      ORDER BY d.date ASC
      `,
        [days, user.id],
      );

      // A day without orders is a complete 0; a day whose lines all lack a cost is null.
      return results.map((row) => ({
        date: row.date,
        revenue_cents: nullableCents(row.revenue_cents),
        turnover_cents: parseInt(row.turnover_cents) || 0,
        ...profitCompleteness(row),
      }));
    });
  }

  async getOrderStatusSummary(
    user: User,
  ): Promise<{ draft: number; confirmed: number; cancelled: number }> {
    const cacheKey = dashboardCacheKey("statusSummary", user.id);
    return this.cachedDashboard(cacheKey, async () => {
      const results = await this.dataSource.query(
        `
      SELECT
        status,
        COUNT(*)::integer as count
      FROM orders
      WHERE user_id = $1 AND deleted_at IS NULL
      GROUP BY status
      `,
        [user.id],
      );

      const summary = { draft: 0, confirmed: 0, cancelled: 0 };
      for (const row of results) {
        if (row.status in summary) {
          summary[row.status as keyof typeof summary] =
            parseInt(row.count) || 0;
        }
      }
      return summary;
    });
  }
}
