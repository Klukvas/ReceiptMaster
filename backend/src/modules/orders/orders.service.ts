import { Injectable, HttpStatus } from "@nestjs/common";
import { ApiErrors } from "../../common/errors/ApiError";
import { InjectRepository, InjectDataSource } from "@nestjs/typeorm";
import { Repository, DataSource, In } from "typeorm";
import { Order, OrderStatus } from "./entities/order.entity";
import { OrderItem } from "./entities/order-item.entity";
import { IdempotencyKey } from "./entities/idempotency-key.entity";
import { Product } from "../products/entities/product.entity";
import { Recipient } from "../recipients/entities/recipient.entity";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import { PaginationDto, SortOrder } from "../../common/dto/pagination.dto";
import { PaginatedResponse } from "../../common/interfaces/paginated-response.interface";
import { ReceiptsService } from "../receipts/receipts.service";
import { CacheService } from "../../common/services/cache.service";
import { User } from "../users/entities/user.entity";

const DASHBOARD_CACHE_TTL = 300; // 5 minutes

const ORDER_SORTABLE_COLUMNS: Record<string, string> = {
  created_at: "order.created_at",
  total_cents: "order.total_cents",
  status: "order.status",
  recipient_name: "recipient.name",
};

// Idempotency key expiration time (24 hours)
const IDEMPOTENCY_KEY_EXPIRATION_HOURS = 24;

export interface IdempotencyResponse {
  statusCode: number;
  data: any;
  isFromCache: boolean;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemsRepository: Repository<OrderItem>,
    @InjectRepository(IdempotencyKey)
    private idempotencyKeyRepository: Repository<IdempotencyKey>,
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(Recipient)
    private recipientsRepository: Repository<Recipient>,
    @InjectDataSource()
    private dataSource: DataSource,
    private receiptsService: ReceiptsService,
    private cacheService: CacheService,
  ) {}

  private async invalidateDashboardCache(userId: string): Promise<void> {
    await this.cacheService.delByPattern(`dashboard:*:${userId}:*`);
  }

  private dashboardCacheKey(
    method: string,
    userId: string,
    ...args: unknown[]
  ): string {
    return `dashboard:${method}:${userId}:${JSON.stringify(args)}`;
  }

  async create(
    createOrderDto: CreateOrderDto,
    user: User,
    idempotencyKey?: string,
  ): Promise<IdempotencyResponse> {
    // Advisory lock + idempotency check + order creation in a single transaction
    const result = await this.dataSource.transaction(async (manager) => {
      // Acquire advisory lock if idempotency key is provided (prevents race conditions)
      if (idempotencyKey) {
        await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
          idempotencyKey,
        ]);

        const existingKey = await manager.findOne(IdempotencyKey, {
          where: { key: idempotencyKey, user_id: user.id },
        });

        if (existingKey) {
          if (existingKey.expires_at < new Date()) {
            await manager.delete(IdempotencyKey, { id: existingKey.id });
          } else {
            return {
              statusCode: existingKey.status_code,
              data: existingKey.response,
              isFromCache: true,
            } as IdempotencyResponse;
          }
        }
      }

      // Check recipient existence and ownership
      const recipient = await manager.findOne(Recipient, {
        where: { id: createOrderDto.recipientId, user_id: user.id },
      });
      if (!recipient) {
        throw ApiErrors.RECIPIENT_NOT_FOUND(createOrderDto.recipientId);
      }

      // Get products with pessimistic locking to prevent race conditions
      const productIds = createOrderDto.items.map((item) => item.productId);
      const products = await manager.find(Product, {
        where: { id: In(productIds), user_id: user.id },
        lock: { mode: "pessimistic_write" },
      });

      if (products.length !== productIds.length) {
        throw ApiErrors.PRODUCT_NOT_FOUND("One or more products not found");
      }

      const productMap = new Map(products.map((p) => [p.id, p]));

      // Check product quantities and calculate amounts
      let subtotalCents = 0;
      const currency = products[0].currency; // Take currency from first product

      for (const itemDto of createOrderDto.items) {
        const product = productMap.get(itemDto.productId)!;

        // Check if product has enough quantity
        if (product.quantity < itemDto.qty) {
          throw ApiErrors.VALIDATION_ERROR(
            "quantity",
            `Недостаточно товара "${product.name}". Доступно: ${product.quantity}, запрошено: ${itemDto.qty}`,
          );
        }

        // Use custom price if provided, otherwise use product's sale price
        const unitPriceCents =
          itemDto.unitPriceCents ?? product.sale_price_cents;
        const lineTotalCents = unitPriceCents * itemDto.qty;
        subtotalCents += lineTotalCents;
      }

      // Create order with calculated amounts
      const newOrder = manager.create(Order, {
        recipient_id: createOrderDto.recipientId,
        status: OrderStatus.DRAFT,
        currency: currency,
        subtotal_cents: subtotalCents,
        total_cents: subtotalCents,
        created_by: "manually",
        user_id: user.id,
      });

      const savedOrder = await manager.save(Order, newOrder);

      // Create order items
      for (const itemDto of createOrderDto.items) {
        const product = productMap.get(itemDto.productId)!;
        // Use custom price if provided, otherwise use product's sale price
        const unitPriceCents =
          itemDto.unitPriceCents ?? product.sale_price_cents;
        const lineTotalCents = unitPriceCents * itemDto.qty;

        const orderItem = manager.create(OrderItem, {
          order_id: savedOrder.id,
          product_id: product.id,
          product_name: product.name,
          unit_price_cents: unitPriceCents,
          qty: itemDto.qty,
          line_total_cents: lineTotalCents,
          user_id: user.id,
        });

        await manager.save(OrderItem, orderItem);

        // Decrease product quantity
        product.quantity -= itemDto.qty;
        await manager.save(Product, product);
      }

      // Save idempotency key if provided
      if (idempotencyKey) {
        const expiresAt = new Date();
        expiresAt.setHours(
          expiresAt.getHours() + IDEMPOTENCY_KEY_EXPIRATION_HOURS,
        );

        const idempotencyRecord = manager.create(IdempotencyKey, {
          key: idempotencyKey,
          user_id: user.id,
          order_id: savedOrder.id,
          response: savedOrder,
          status_code: HttpStatus.CREATED,
          expires_at: expiresAt,
        });

        await manager.save(IdempotencyKey, idempotencyRecord);
      }

      return {
        statusCode: HttpStatus.CREATED,
        data: savedOrder,
        isFromCache: false,
      } as IdempotencyResponse;
    });

    if (!result.isFromCache) {
      await this.invalidateDashboardCache(user.id);
    }

    return result;
  }

  async findAll(
    paginationDto: PaginationDto,
    user: User,
    status?: OrderStatus,
    filters?: {
      startDate?: Date;
      endDate?: Date;
      minAmount?: number;
      maxAmount?: number;
    },
  ): Promise<PaginatedResponse<Order>> {
    const {
      offset = 0,
      limit = 10,
      search,
      sortBy,
      sortOrder = SortOrder.DESC,
    } = paginationDto;

    const queryBuilder = this.ordersRepository
      .createQueryBuilder("order")
      .leftJoinAndSelect("order.recipient", "recipient")
      .leftJoinAndSelect("order.items", "items")
      .leftJoinAndSelect("order.receipts", "receipts")
      .where("order.user_id = :userId", { userId: user.id });

    if (status) {
      queryBuilder.andWhere("order.status = :status", { status });
    }

    if (search && search.trim()) {
      queryBuilder.andWhere("recipient.name ILIKE :search", {
        search: `%${search.trim()}%`,
      });
    }

    if (filters?.startDate) {
      queryBuilder.andWhere("order.created_at >= :startDate", {
        startDate: filters.startDate,
      });
    }

    if (filters?.endDate) {
      queryBuilder.andWhere("order.created_at <= :endDate", {
        endDate: filters.endDate,
      });
    }

    if (filters?.minAmount !== undefined) {
      queryBuilder.andWhere("order.total_cents >= :minAmount", {
        minAmount: filters.minAmount,
      });
    }

    if (filters?.maxAmount !== undefined) {
      queryBuilder.andWhere("order.total_cents <= :maxAmount", {
        maxAmount: filters.maxAmount,
      });
    }

    const sortColumn = ORDER_SORTABLE_COLUMNS[sortBy] || "order.created_at";
    const direction = sortOrder === SortOrder.ASC ? "ASC" : "DESC";
    queryBuilder.orderBy(sortColumn, direction);

    const [data, total] = await queryBuilder
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return { data, total, offset, limit };
  }

  async findOne(id: string, user: User): Promise<Order> {
    const order = await this.ordersRepository.findOne({
      where: { id, user_id: user.id },
      relations: ["recipient", "items", "receipts"],
    });
    if (!order) {
      throw ApiErrors.ORDER_NOT_FOUND(id);
    }
    return order;
  }

  async confirm(id: string, user: User): Promise<Order> {
    const order = await this.findOne(id, user);

    if (order.status !== OrderStatus.DRAFT) {
      throw ApiErrors.ORDER_CANNOT_BE_MODIFIED(id);
    }

    order.status = OrderStatus.CONFIRMED;
    const saved = await this.ordersRepository.save(order);
    await this.invalidateDashboardCache(user.id);
    return saved;
  }

  async cancel(id: string, user: User): Promise<Order> {
    const order = await this.findOne(id, user);

    if (order.status === OrderStatus.CANCELLED) {
      throw ApiErrors.ORDER_ALREADY_CANCELLED(id);
    }

    order.status = OrderStatus.CANCELLED;
    const saved = await this.ordersRepository.save(order);
    await this.invalidateDashboardCache(user.id);
    return saved;
  }

  async update(
    id: string,
    updateOrderDto: UpdateOrderDto,
    user: User,
  ): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      // Load order without relations to avoid conflicts with cascade operations
      const order = await manager.findOne(Order, {
        where: { id, user_id: user.id },
      });

      if (!order) {
        throw ApiErrors.ORDER_NOT_FOUND(id);
      }

      // Can only edit orders in "draft" status
      if (order.status !== OrderStatus.DRAFT) {
        throw ApiErrors.ORDER_CANNOT_BE_MODIFIED(id);
      }

      // Cannot edit locked orders (receipt has been generated)
      if (order.is_locked) {
        throw ApiErrors.ORDER_CANNOT_BE_MODIFIED(id);
      }

      // If recipient is being updated
      if (updateOrderDto.recipientId) {
        const recipient = await manager.findOne(Recipient, {
          where: { id: updateOrderDto.recipientId, user_id: user.id },
        });
        if (!recipient) {
          throw ApiErrors.RECIPIENT_NOT_FOUND(updateOrderDto.recipientId);
        }
        order.recipient_id = updateOrderDto.recipientId;
      }

      // If products are being updated
      if (updateOrderDto.items) {
        // First, restore quantities from existing order items with pessimistic locking
        const existingOrderItems = await manager.find(OrderItem, {
          where: { order_id: id },
        });

        // Collect all product IDs that need to be updated (old + new)
        const oldProductIds = existingOrderItems.map((item) => item.product_id);
        const newProductIds = updateOrderDto.items.map(
          (item) => item.productId,
        );
        const allProductIds = [
          ...new Set([...oldProductIds, ...newProductIds]),
        ];

        // Lock all products that will be affected
        const allProducts = await manager.find(Product, {
          where: { id: In(allProductIds) },
          lock: { mode: "pessimistic_write" },
        });
        const productMap = new Map(allProducts.map((p) => [p.id, p]));

        // Restore quantities from existing order items
        for (const existingItem of existingOrderItems) {
          const product = productMap.get(existingItem.product_id);
          if (product) {
            product.quantity += existingItem.qty;
          }
        }

        // Verify ownership of new products
        const products = newProductIds
          .map((pid) => productMap.get(pid))
          .filter(Boolean) as Product[];
        const ownedProducts = products.filter((p) => p.user_id === user.id);

        if (ownedProducts.length !== newProductIds.length) {
          throw ApiErrors.PRODUCT_NOT_FOUND("One or more products not found");
        }

        // Check quantities and calculate new amounts
        let subtotalCents = 0;
        const currency = ownedProducts[0].currency; // Take currency from first product

        for (const itemDto of updateOrderDto.items) {
          const product = productMap.get(itemDto.productId)!;

          // Check if product has enough quantity
          if (product.quantity < itemDto.qty) {
            throw ApiErrors.VALIDATION_ERROR(
              "quantity",
              `Недостаточно товара "${product.name}". Доступно: ${product.quantity}, запрошено: ${itemDto.qty}`,
            );
          }

          // Use custom price if provided, otherwise use product's sale price
          const unitPriceCents =
            itemDto.unitPriceCents ?? product.sale_price_cents;
          const lineTotalCents = unitPriceCents * itemDto.qty;
          subtotalCents += lineTotalCents;
        }

        // Update order amounts
        order.subtotal_cents = subtotalCents;
        order.total_cents = subtotalCents;
        order.currency = currency;

        // First delete all existing order items
        await manager.delete(OrderItem, { order_id: id });

        // Create new order items
        for (const itemDto of updateOrderDto.items) {
          const product = productMap.get(itemDto.productId)!;
          // Use custom price if provided, otherwise use product's sale price
          const unitPriceCents =
            itemDto.unitPriceCents ?? product.sale_price_cents;
          const lineTotalCents = unitPriceCents * itemDto.qty;

          const orderItem = manager.create(OrderItem, {
            order_id: id,
            product_id: product.id,
            product_name: product.name,
            unit_price_cents: unitPriceCents,
            qty: itemDto.qty,
            line_total_cents: lineTotalCents,
            user_id: user.id,
          });

          await manager.save(OrderItem, orderItem);

          // Decrease product quantity
          product.quantity -= itemDto.qty;
          await manager.save(Product, product);
        }
      }

      // Update payment status if provided
      if (updateOrderDto.paymentStatus) {
        order.payment_status = updateOrderDto.paymentStatus;
      }

      // Save order
      await manager.save(Order, order);

      // Return order with full relations
      return manager.findOne(Order, {
        where: { id },
        relations: ["recipient", "items", "receipts"],
      });
    });
  }

  async remove(id: string, user: User): Promise<void> {
    const order = await this.findOne(id, user);
    if (!order) {
      throw ApiErrors.ORDER_NOT_FOUND(id);
    }

    // Soft delete: restore product quantities and mark as deleted
    await this.dataSource.transaction(async (manager) => {
      // Restore product quantities
      const orderItems = await manager.find(OrderItem, {
        where: { order_id: id },
      });

      for (const orderItem of orderItems) {
        const product = await manager.findOne(Product, {
          where: { id: orderItem.product_id },
        });
        if (product) {
          product.quantity += orderItem.qty;
          await manager.save(Product, product);
        }
      }

      // Soft delete the order (sets deleted_at timestamp)
      await manager.softDelete(Order, { id });
    });
  }

  async markAsLocked(orderId: string, user: User): Promise<void> {
    await this.ordersRepository.update(
      { id: orderId, user_id: user.id },
      { is_locked: true },
    );
  }

  async unlockOrder(orderId: string, user: User): Promise<void> {
    await this.ordersRepository.update(
      { id: orderId, user_id: user.id },
      { is_locked: false },
    );
  }

  async approveBatch(
    orderIds: string[],
    user: User,
  ): Promise<{ approved: number }> {
    // Deduplicate IDs
    const uniqueIds = [...new Set(orderIds)];

    const result = await this.dataSource.transaction(async (manager) => {
      const orders = await manager.find(Order, {
        where: { id: In(uniqueIds), user_id: user.id },
      });

      if (orders.length !== uniqueIds.length) {
        const foundIds = new Set(orders.map((o) => o.id));
        const missingIds = uniqueIds.filter((id) => !foundIds.has(id));
        throw ApiErrors.ORDER_NOT_FOUND(missingIds.join(", "));
      }

      const nonDraftOrders = orders.filter(
        (o) => o.status !== OrderStatus.DRAFT,
      );
      if (nonDraftOrders.length > 0) {
        throw ApiErrors.BATCH_ORDERS_NOT_ALL_DRAFT(
          nonDraftOrders.map((o) => o.id),
        );
      }

      await manager.update(
        Order,
        { id: In(uniqueIds), user_id: user.id },
        { status: OrderStatus.CONFIRMED },
      );

      return { approved: orders.length };
    });

    await this.invalidateDashboardCache(user.id);
    return result;
  }

  async deleteBatch(
    orderIds: string[],
    user: User,
  ): Promise<{ deleted: number }> {
    const uniqueIds = [...new Set(orderIds)];

    const result = await this.dataSource.transaction(async (manager) => {
      const orders = await manager.find(Order, {
        where: { id: In(uniqueIds), user_id: user.id },
      });

      if (orders.length !== uniqueIds.length) {
        const foundIds = new Set(orders.map((o) => o.id));
        const missingIds = uniqueIds.filter((id) => !foundIds.has(id));
        throw ApiErrors.ORDER_NOT_FOUND(missingIds.join(", "));
      }

      // Restore product quantities for all order items
      for (const order of orders) {
        const orderItems = await manager.find(OrderItem, {
          where: { order_id: order.id },
        });

        for (const orderItem of orderItems) {
          const product = await manager.findOne(Product, {
            where: { id: orderItem.product_id },
          });
          if (product) {
            product.quantity += orderItem.qty;
            await manager.save(Product, product);
          }
        }
      }

      await manager.softDelete(Order, { id: In(uniqueIds) });

      return { deleted: orders.length };
    });

    await this.invalidateDashboardCache(user.id);
    return result;
  }

  private async cachedDashboard<T>(
    key: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.cacheService.get<T>(key);
    if (cached) return cached;
    const result = await fn();
    await this.cacheService.set(key, result, DASHBOARD_CACHE_TTL);
    return result;
  }

  // Dashboard methods
  async getRevenueByProducts(
    user: User,
    startDate?: Date,
    endDate?: Date,
  ): Promise<
    Array<{
      product_id: string;
      product_name: string;
      total_revenue_cents: number;
      total_quantity: number;
      currency: string;
    }>
  > {
    const cacheKey = this.dashboardCacheKey(
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
        SUM((oi.unit_price_cents - p.purchase_price_cents) * oi.qty) as total_revenue_cents,
        SUM(oi.qty) as total_quantity,
        o.currency
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi.order_id
      INNER JOIN products p ON p.id = oi.product_id
      WHERE o.status = $1 AND o.user_id = $2
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
      ORDER BY total_revenue_cents DESC
    `;

      const results = await this.dataSource.query(query, params);

      return results.map((row) => ({
        product_id: row.product_id,
        product_name: row.product_name,
        total_revenue_cents: parseInt(row.total_revenue_cents) || 0,
        total_quantity: parseInt(row.total_quantity) || 0,
        currency: row.currency,
      }));
    });
  }

  async getRevenueByRecipients(
    user: User,
    startDate?: Date,
    endDate?: Date,
  ): Promise<
    Array<{
      recipient_id: string;
      recipient_name: string;
      total_revenue_cents: number;
      total_orders: number;
      currency: string;
    }>
  > {
    const cacheKey = this.dashboardCacheKey(
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
        SUM((oi.unit_price_cents - p.purchase_price_cents) * oi.qty) as total_revenue_cents,
        COUNT(DISTINCT o.id) as total_orders,
        o.currency
      FROM orders o
      INNER JOIN recipients r ON r.id = o.recipient_id
      INNER JOIN order_items oi ON oi.order_id = o.id
      INNER JOIN products p ON p.id = oi.product_id
      WHERE o.status = $1 AND o.user_id = $2
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
      ORDER BY total_revenue_cents DESC
    `;

      const results = await this.dataSource.query(query, params);

      return results.map((row) => ({
        recipient_id: row.recipient_id,
        recipient_name: row.recipient_name,
        total_revenue_cents: parseInt(row.total_revenue_cents) || 0,
        total_orders: parseInt(row.total_orders) || 0,
        currency: row.currency,
      }));
    });
  }

  async getTotalRevenue(
    user: User,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    total_revenue_cents: number;
    total_orders: number;
    currency: string;
  }> {
    const cacheKey = this.dashboardCacheKey(
      "totalRevenue",
      user.id,
      startDate,
      endDate,
    );
    return this.cachedDashboard(cacheKey, async () => {
      let query = `
      SELECT
        SUM((oi.unit_price_cents - p.purchase_price_cents) * oi.qty) as total_revenue_cents,
        COUNT(DISTINCT o.id) as total_orders,
        o.currency
      FROM orders o
      INNER JOIN order_items oi ON oi.order_id = o.id
      INNER JOIN products p ON p.id = oi.product_id
      WHERE o.status = $1 AND o.user_id = $2
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
        total_revenue_cents: result
          ? parseInt(result.total_revenue_cents) || 0
          : 0,
        total_orders: result ? parseInt(result.total_orders) || 0 : 0,
        currency: result?.currency || "UAH",
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
    const cacheKey = this.dashboardCacheKey(
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
      WHERE o.status = $1 AND o.user_id = $2
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
    const cacheKey = this.dashboardCacheKey(
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
      WHERE o.status = $1 AND o.user_id = $2
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
    const cacheKey = this.dashboardCacheKey(
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
      WHERE o.status = $1 AND o.user_id = $2
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
  ): Promise<
    Array<{ date: string; revenue_cents: number; turnover_cents: number }>
  > {
    const cacheKey = this.dashboardCacheKey("dailyRevenue", user.id, days);
    return this.cachedDashboard(cacheKey, async () => {
      const results = await this.dataSource.query(
        `
      SELECT
        d.date::text as date,
        COALESCE(SUM((oi.unit_price_cents - p.purchase_price_cents) * oi.qty), 0)::integer as revenue_cents,
        COALESCE(SUM(oi.line_total_cents), 0)::integer as turnover_cents
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
      LEFT JOIN products p ON p.id = oi.product_id
      GROUP BY d.date
      ORDER BY d.date ASC
      `,
        [days, user.id],
      );

      return results.map((row) => ({
        date: row.date,
        revenue_cents: parseInt(row.revenue_cents) || 0,
        turnover_cents: parseInt(row.turnover_cents) || 0,
      }));
    });
  }

  async getOrderStatusSummary(
    user: User,
  ): Promise<{ draft: number; confirmed: number; cancelled: number }> {
    const cacheKey = this.dashboardCacheKey("statusSummary", user.id);
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
