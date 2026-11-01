import { Injectable, HttpStatus, Logger } from "@nestjs/common";
import { ApiErrors } from "../../common/errors/ApiError";
import { InjectRepository, InjectDataSource } from "@nestjs/typeorm";
import { Repository, DataSource, EntityManager, In } from "typeorm";
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
import { SubscriptionService } from "../subscription/subscription.service";
import { SettingsService } from "../settings/services/settings.service";
import { containsPattern } from "../../common/utils/like-pattern.util";
import { dashboardCachePattern } from "./dashboard-cache";
import { draftLineCost, snapshotCost } from "./order-item-cost";

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
  private readonly logger = new Logger(OrdersService.name);

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
    private subscriptionService: SubscriptionService,
    private settingsService: SettingsService,
  ) {}

  private async invalidateDashboardCache(userId: string): Promise<void> {
    await this.cacheService.delByPattern(dashboardCachePattern(userId));
  }

  /** Row lock on a live order; every lifecycle transition starts here. */
  private async lockOrder(
    manager: EntityManager,
    id: string,
    userId: string,
  ): Promise<Order> {
    const order = await manager.findOne(Order, {
      where: { id, user_id: userId },
      lock: { mode: "pessimistic_write" },
    });
    if (!order) throw ApiErrors.ORDER_NOT_FOUND(id);
    return order;
  }

  /** Status change fenced by the status observed under the row lock. */
  private async transition(
    manager: EntityManager,
    order: Order,
    status: OrderStatus,
  ): Promise<void> {
    const result = await manager.update(
      Order,
      { id: order.id, user_id: order.user_id, status: order.status },
      { status },
    );
    if (result.affected !== 1)
      throw ApiErrors.ORDER_CANNOT_BE_MODIFIED(order.id);
  }

  /**
   * Queues receipts for freshly confirmed orders when the account opted in.
   * Confirmation is already committed, so a generation failure (plan limits,
   * snapshot errors) is logged and the order keeps its manual "Generate" path.
   * Sequential on purpose: generation serializes on a per-tenant advisory lock.
   */
  private async autoGenerateReceipts(
    orderIds: string[],
    user: User,
  ): Promise<void> {
    const isEnabled = await this.settingsService
      .getAutoGenerateReceipt(user.id)
      .catch((error: unknown) => {
        this.logger.error(
          `Auto-receipt setting lookup failed for user ${user.id}`,
          error instanceof Error ? error.stack : String(error),
        );
        return false;
      });
    if (!isEnabled) return;

    for (const orderId of orderIds) {
      try {
        await this.receiptsService.generateReceipt(orderId, user);
      } catch (error) {
        this.logger.warn(
          `Auto-receipt failed for order ${orderId} (user ${user.id}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private validateItems(items: CreateOrderDto["items"]): void {
    if (!items.length) {
      throw ApiErrors.VALIDATION_ERROR(
        "items",
        "Order must contain at least one item",
      );
    }
    if (new Set(items.map((item) => item.productId)).size !== items.length) {
      throw ApiErrors.VALIDATION_ERROR(
        "items",
        "Each product may appear only once in an order",
      );
    }
  }

  private orderCurrency(products: Product[]): string {
    const currency = products[0]?.currency;
    if (
      !currency ||
      products.some((product) => product.currency !== currency)
    ) {
      throw ApiErrors.VALIDATION_ERROR(
        "currency",
        "All order products must use the same currency",
      );
    }
    return currency;
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

      await this.subscriptionService.assertCanCreateOrderInTx(manager, user.id);
      this.validateItems(createOrderDto.items);

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
        order: { id: "ASC" },
        lock: { mode: "pessimistic_write" },
      });

      if (products.length !== productIds.length) {
        throw ApiErrors.PRODUCT_NOT_FOUND("One or more products not found");
      }

      const productMap = new Map(products.map((p) => [p.id, p]));

      // Check product quantities and calculate amounts
      let subtotalCents = 0;
      const currency = this.orderCurrency(products);

      for (const itemDto of createOrderDto.items) {
        const product = productMap.get(itemDto.productId)!;

        // Check if product has enough quantity
        if (product.quantity < itemDto.qty) {
          throw ApiErrors.VALIDATION_ERROR(
            "quantity",
            `Not enough stock for "${product.name}". Available: ${product.quantity}, requested: ${itemDto.qty}`,
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
          unit_cost_cents: snapshotCost(product),
          qty: itemDto.qty,
          line_total_cents: lineTotalCents,
          user_id: user.id,
        });

        await manager.save(OrderItem, orderItem);

        // Decrease product quantity
        await manager.save(Product, {
          ...product,
          quantity: product.quantity - itemDto.qty,
        });
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
      productId?: string;
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
        search: containsPattern(search),
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

    if (filters?.productId) {
      queryBuilder.andWhere("items.product_id = :productId", {
        productId: filters.productId,
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

  /**
   * DRAFT → CONFIRMED under the order row lock, so a cancel that committed first
   * is seen and wins. Line costs are not touched: they were frozen when the draft
   * lines were written. Auto-generation runs only after the commit.
   */
  async confirm(id: string, user: User): Promise<Order> {
    const confirmed = await this.dataSource.transaction(async (manager) => {
      const order = await this.lockOrder(manager, id, user.id);
      if (order.status !== OrderStatus.DRAFT) {
        throw ApiErrors.ORDER_CANNOT_BE_MODIFIED(id);
      }
      await this.transition(manager, order, OrderStatus.CONFIRMED);
      return manager.findOneOrFail(Order, {
        where: { id, user_id: user.id },
        relations: ["recipient", "items", "receipts"],
      });
    });
    await this.invalidateDashboardCache(user.id);
    await this.autoGenerateReceipts([confirmed.id], user);
    return confirmed;
  }

  /**
   * DRAFT or CONFIRMED → CANCELLED in one transaction, taking the tenant receipt
   * lock first and then the order row (the same tenant → order → receipt order as
   * generation and promotion). Cancelling a confirmed order voids its active
   * document and pending candidate and revokes the share link; voided documents
   * stay as history. Stock is not returned here — only deleting the order does
   * that, exactly once.
   */
  async cancel(id: string, user: User): Promise<Order> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 1))",
        [user.id],
      );
      const order = await this.lockOrder(manager, id, user.id);
      if (order.status === OrderStatus.CANCELLED) {
        throw ApiErrors.ORDER_ALREADY_CANCELLED(id);
      }
      if (order.status === OrderStatus.CONFIRMED) {
        await this.receiptsService.voidForCancellation(manager, id, user.id);
      }
      await this.transition(manager, order, OrderStatus.CANCELLED);
    });
    await this.invalidateDashboardCache(user.id);
    return this.findOne(id, user);
  }

  async update(
    id: string,
    updateOrderDto: UpdateOrderDto,
    user: User,
  ): Promise<Order> {
    const result = await this.dataSource.transaction(async (manager) => {
      // Load order without relations to avoid conflicts with cascade operations
      const order = await manager.findOne(Order, {
        where: { id, user_id: user.id },
        lock: { mode: "pessimistic_write" },
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
        this.validateItems(updateOrderDto.items);
        // First, restore quantities from existing order items with pessimistic locking
        const existingOrderItems = await manager.find(OrderItem, {
          where: { order_id: id, user_id: user.id },
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
          where: { id: In(allProductIds), user_id: user.id },
          order: { id: "ASC" },
          lock: { mode: "pessimistic_write" },
        });
        const productMap = new Map(allProducts.map((p) => [p.id, p]));

        // Restore quantities from existing order items
        for (const existingItem of existingOrderItems) {
          const product = productMap.get(existingItem.product_id);
          if (product) {
            productMap.set(product.id, {
              ...product,
              quantity: product.quantity + existingItem.qty,
            });
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
        const currency = this.orderCurrency(ownedProducts);

        for (const itemDto of updateOrderDto.items) {
          const product = productMap.get(itemDto.productId)!;

          // Check if product has enough quantity
          if (product.quantity < itemDto.qty) {
            throw ApiErrors.VALIDATION_ERROR(
              "quantity",
              `Not enough stock for "${product.name}". Available: ${product.quantity}, requested: ${itemDto.qty}`,
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

        // Unchanged lines keep their frozen cost; see draftLineCost.
        const previousLines = new Map(
          existingOrderItems.map((item) => [item.product_id, item]),
        );

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
            unit_cost_cents: draftLineCost(
              previousLines.get(product.id),
              itemDto.qty,
              product,
            ),
            qty: itemDto.qty,
            line_total_cents: lineTotalCents,
            user_id: user.id,
          });

          await manager.save(OrderItem, orderItem);

          // Decrease product quantity
          productMap.set(product.id, {
            ...product,
            quantity: product.quantity - itemDto.qty,
          });
        }

        // Persist the union, including products removed from the order.
        await manager.save(Product, [...productMap.values()]);
      }

      // Save order
      await manager.save(Order, order);

      // Return order with full relations
      return manager.findOne(Order, {
        where: { id, user_id: user.id },
        relations: ["recipient", "items", "receipts"],
      });
    });
    await this.invalidateDashboardCache(user.id);
    return result;
  }

  async remove(id: string, user: User): Promise<void> {
    // The live-order lock makes stock restoration single-winner, including batch overlap.
    await this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id, user_id: user.id },
        lock: { mode: "pessimistic_write" },
      });
      if (!order) throw ApiErrors.ORDER_NOT_FOUND(id);

      const orderItems = await manager.find(OrderItem, {
        where: { order_id: id, user_id: user.id },
      });

      // Aggregate quantity changes per product
      const qtyUpdates = new Map<string, number>();
      for (const item of orderItems) {
        qtyUpdates.set(
          item.product_id,
          (qtyUpdates.get(item.product_id) ?? 0) + item.qty,
        );
      }

      // Batch restore product quantities
      for (const [productId, qty] of [...qtyUpdates.entries()].sort(
        ([a], [b]) => a.localeCompare(b),
      )) {
        await manager.increment(
          Product,
          { id: productId, user_id: user.id },
          "quantity",
          qty,
        );
      }

      // Soft delete the order (sets deleted_at timestamp)
      await manager.softDelete(Order, { id, user_id: user.id });
    });
    await this.invalidateDashboardCache(user.id);
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
    // Deduplicate IDs; keep request order for auto-generation, lock in id order.
    const uniqueIds = [...new Set(orderIds)];
    const lockOrderIds = [...uniqueIds].sort();

    const result = await this.dataSource.transaction(async (manager) => {
      // Same deterministic row-lock order as deleteBatch; DRAFT is checked under it.
      const orders = await manager.find(Order, {
        where: { id: In(lockOrderIds), user_id: user.id },
        order: { id: "ASC" },
        lock: { mode: "pessimistic_write" },
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
        { id: In(lockOrderIds), user_id: user.id, status: OrderStatus.DRAFT },
        { status: OrderStatus.CONFIRMED },
      );

      return { approved: orders.length };
    });

    await this.invalidateDashboardCache(user.id);
    await this.autoGenerateReceipts(uniqueIds, user);
    return result;
  }

  async deleteBatch(
    orderIds: string[],
    user: User,
  ): Promise<{ deleted: number }> {
    const uniqueIds = [...new Set(orderIds)].sort();

    const result = await this.dataSource.transaction(async (manager) => {
      const orders = await manager.find(Order, {
        where: { id: In(uniqueIds), user_id: user.id },
        order: { id: "ASC" },
        lock: { mode: "pessimistic_write" },
      });

      if (orders.length !== uniqueIds.length) {
        const foundIds = new Set(orders.map((o) => o.id));
        const missingIds = uniqueIds.filter((id) => !foundIds.has(id));
        throw ApiErrors.ORDER_NOT_FOUND(missingIds.join(", "));
      }

      // Batch load all order items for all orders at once
      const allOrderItems = await manager.find(OrderItem, {
        where: { order_id: In(uniqueIds), user_id: user.id },
      });

      // Aggregate quantity changes per product
      const qtyUpdates = new Map<string, number>();
      for (const item of allOrderItems) {
        qtyUpdates.set(
          item.product_id,
          (qtyUpdates.get(item.product_id) ?? 0) + item.qty,
        );
      }

      // Batch restore product quantities
      for (const [productId, qty] of [...qtyUpdates.entries()].sort(
        ([a], [b]) => a.localeCompare(b),
      )) {
        await manager.increment(
          Product,
          { id: productId, user_id: user.id },
          "quantity",
          qty,
        );
      }

      await manager.softDelete(Order, { id: In(uniqueIds), user_id: user.id });

      return { deleted: orders.length };
    });

    await this.invalidateDashboardCache(user.id);
    return result;
  }
}
