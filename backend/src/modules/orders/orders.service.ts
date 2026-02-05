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
import { PaginationDto } from "../../common/dto/pagination.dto";
import { ReceiptsService } from "../receipts/receipts.service";
import { User } from "../users/entities/user.entity";

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  offset: number;
  limit: number;
}

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
  ) {}

  async create(
    createOrderDto: CreateOrderDto,
    user: User,
    idempotencyKey?: string,
  ): Promise<IdempotencyResponse> {
    // Check for existing idempotency key if provided
    if (idempotencyKey) {
      const existingKey = await this.idempotencyKeyRepository.findOne({
        where: { key: idempotencyKey, user_id: user.id },
      });

      if (existingKey) {
        // Check if the key has expired
        if (existingKey.expires_at < new Date()) {
          // Key expired, delete it and proceed with new request
          await this.idempotencyKeyRepository.delete({ id: existingKey.id });
        } else {
          // Return cached response
          return {
            statusCode: existingKey.status_code,
            data: existingKey.response,
            isFromCache: true,
          };
        }
      }
    }

    const order = await this.dataSource.transaction(async (manager) => {
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
        const unitPriceCents = itemDto.unitPriceCents ?? product.sale_price_cents;
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
        const unitPriceCents = itemDto.unitPriceCents ?? product.sale_price_cents;
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
        expiresAt.setHours(expiresAt.getHours() + IDEMPOTENCY_KEY_EXPIRATION_HOURS);

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

      return savedOrder;
    });

    return {
      statusCode: HttpStatus.CREATED,
      data: order,
      isFromCache: false,
    };
  }

  async findAll(
    paginationDto: PaginationDto,
    user: User,
    status?: OrderStatus,
  ): Promise<PaginatedResponse<Order>> {
    const { offset = 0, limit = 10 } = paginationDto;
    const skip = offset;

    const queryBuilder = this.ordersRepository
      .createQueryBuilder("order")
      .leftJoinAndSelect("order.recipient", "recipient")
      .leftJoinAndSelect("order.items", "items")
      .leftJoinAndSelect("order.receipts", "receipts")
      .where("order.user_id = :userId", { userId: user.id })
      .orderBy("order.created_at", "DESC")
      .skip(skip)
      .take(limit);

    if (status) {
      queryBuilder.andWhere("order.status = :status", { status });
    }

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      offset: skip,
      limit: limit,
    };
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
    return this.ordersRepository.save(order);
  }

  async cancel(id: string, user: User): Promise<Order> {
    const order = await this.findOne(id, user);

    if (order.status === OrderStatus.CANCELLED) {
      throw ApiErrors.ORDER_ALREADY_CANCELLED(id);
    }

    order.status = OrderStatus.CANCELLED;
    return this.ordersRepository.save(order);
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
        const newProductIds = updateOrderDto.items.map((item) => item.productId);
        const allProductIds = [...new Set([...oldProductIds, ...newProductIds])];

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
        const products = newProductIds.map((pid) => productMap.get(pid)).filter(Boolean) as Product[];
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
          const unitPriceCents = itemDto.unitPriceCents ?? product.sale_price_cents;
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
          const unitPriceCents = itemDto.unitPriceCents ?? product.sale_price_cents;
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

    // Allow deletion of orders in any status
    // Delete order and related elements in transaction
    await this.dataSource.transaction(async (manager) => {
      // Restore product quantities before deleting order items
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

      // Delete receipt files and records first
      await this.receiptsService.deleteReceiptFilesForOrder(id);

      // Delete order items
      await manager.delete(OrderItem, { order_id: id });
      // Delete the order itself
      await manager.delete(Order, { id });
    });
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
      total_revenue_cents: result ? parseInt(result.total_revenue_cents) || 0 : 0,
      total_orders: result ? parseInt(result.total_orders) || 0 : 0,
      currency: result?.currency || "UAH",
    };
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
      total_turnover_cents: result ? parseInt(result.total_turnover_cents) || 0 : 0,
      total_orders: result ? parseInt(result.total_orders) || 0 : 0,
      currency: result?.currency || "UAH",
    };
  }
}
