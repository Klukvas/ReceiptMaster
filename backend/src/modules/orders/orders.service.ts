import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository, InjectDataSource } from "@nestjs/typeorm";
import { Repository, DataSource, In } from "typeorm";
import { Order, OrderStatus } from "./entities/order.entity";
import { OrderItem } from "./entities/order-item.entity";
import { Product } from "../products/entities/product.entity";
import { Recipient } from "../recipients/entities/recipient.entity";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { ReceiptsService } from "../receipts/receipts.service";

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  offset: number;
  limit: number;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemsRepository: Repository<OrderItem>,
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(Recipient)
    private recipientsRepository: Repository<Recipient>,
    @InjectDataSource()
    private dataSource: DataSource,
    private receiptsService: ReceiptsService,
  ) {}

  async create(createOrderDto: CreateOrderDto): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      // Check recipient existence
      const recipient = await manager.findOne(Recipient, {
        where: { id: createOrderDto.recipientId },
      });
      if (!recipient) {
        throw new NotFoundException("Recipient not found");
      }

      // Get products and check their existence
      const productIds = createOrderDto.items.map((item) => item.productId);
      const products = await manager.find(Product, {
        where: { id: In(productIds) },
      });

      if (products.length !== productIds.length) {
        throw new NotFoundException("One or more products not found");
      }

      const productMap = new Map(products.map((p) => [p.id, p]));

      // Calculate amounts before creating order
      let subtotalCents = 0;
      const currency = products[0].currency; // Take currency from first product

      for (const itemDto of createOrderDto.items) {
        const product = productMap.get(itemDto.productId)!;
        const lineTotalCents = product.sale_price_cents * itemDto.qty;

        subtotalCents += lineTotalCents;
      }

      // Create order with calculated amounts
      const order = manager.create(Order, {
        recipient_id: createOrderDto.recipientId,
        status: OrderStatus.DRAFT,
        currency: currency,
        subtotal_cents: subtotalCents,
        total_cents: subtotalCents,
      });

      const savedOrder = await manager.save(Order, order);

      // Create order items
      for (const itemDto of createOrderDto.items) {
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

      return savedOrder;
    });
  }

  async findAll(
    paginationDto: PaginationDto,
    status?: OrderStatus,
  ): Promise<PaginatedResponse<Order>> {
    const { offset = 0, limit = 10 } = paginationDto;
    const skip = offset;

    const queryBuilder = this.ordersRepository
      .createQueryBuilder("order")
      .leftJoinAndSelect("order.recipient", "recipient")
      .leftJoinAndSelect("order.items", "items")
      .leftJoinAndSelect("order.receipts", "receipts")
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

  async findOne(id: string): Promise<Order> {
    const order = await this.ordersRepository.findOne({
      where: { id },
      relations: ["recipient", "items", "receipts"],
    });
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    return order;
  }

  async confirm(id: string): Promise<Order> {
    const order = await this.findOne(id);

    if (order.status !== OrderStatus.DRAFT) {
      throw new BadRequestException(
        'Can only confirm orders in "draft" status',
      );
    }

    order.status = OrderStatus.CONFIRMED;
    return this.ordersRepository.save(order);
  }

  async cancel(id: string): Promise<Order> {
    const order = await this.findOne(id);

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException("Order already cancelled");
    }

    order.status = OrderStatus.CANCELLED;
    return this.ordersRepository.save(order);
  }

  async update(id: string, updateOrderDto: UpdateOrderDto): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      // Load order without relations to avoid conflicts with cascade operations
      const order = await manager.findOne(Order, {
        where: { id },
      });

      if (!order) {
        throw new NotFoundException("Order not found");
      }

      // Can only edit orders in "draft" status
      if (order.status !== OrderStatus.DRAFT) {
        throw new BadRequestException('Can only edit orders in "draft" status');
      }

      // If recipient is being updated
      if (updateOrderDto.recipientId) {
        const recipient = await manager.findOne(Recipient, {
          where: { id: updateOrderDto.recipientId },
        });
        if (!recipient) {
          throw new NotFoundException("Recipient not found");
        }
        order.recipient_id = updateOrderDto.recipientId;
      }

      // If products are being updated
      if (updateOrderDto.items) {
        // Get products and check their existence
        const productIds = updateOrderDto.items.map((item) => item.productId);
        const products = await manager.find(Product, {
          where: { id: In(productIds) },
        });

        if (products.length !== productIds.length) {
          throw new NotFoundException("One or more products not found");
        }

        const productMap = new Map(products.map((p) => [p.id, p]));

        // Calculate new amounts
        let subtotalCents = 0;
        const currency = products[0].currency; // Take currency from first product

        for (const itemDto of updateOrderDto.items) {
          const product = productMap.get(itemDto.productId)!;
          const lineTotalCents = product.sale_price_cents * itemDto.qty;

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
          const lineTotalCents = product.sale_price_cents * itemDto.qty;

          const orderItem = manager.create(OrderItem, {
            order_id: id,
            product_id: product.id,
            product_name: product.name,
            unit_price_cents: product.sale_price_cents,
            qty: itemDto.qty,
            line_total_cents: lineTotalCents,
          });

          await manager.save(OrderItem, orderItem);
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

  async remove(id: string): Promise<void> {
    const order = await this.findOne(id);
    if(!order) {
      throw new NotFoundException("Order not found");
    }

    // Allow deletion of orders in any status
    // Delete order and related elements in transaction
    await this.dataSource.transaction(async (manager) => {
      // Delete receipt files and records first
      await this.receiptsService.deleteReceiptFilesForOrder(id);
      
      // Delete order items
      await manager.delete(OrderItem, { order_id: id });
      // Delete the order itself
      await manager.delete(Order, { id });
    });
  }

  // Dashboard methods
  async getRevenueByProducts(startDate?: Date, endDate?: Date): Promise<Array<{
    product_id: string;
    product_name: string;
    total_revenue_cents: number;
    total_quantity: number;
    currency: string;
  }>> {
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
      WHERE o.status = $1
    `;
    
    const params: any[] = [OrderStatus.CONFIRMED];
    let paramIndex = 2;

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
    
    return results.map(row => ({
      product_id: row.product_id,
      product_name: row.product_name,
      total_revenue_cents: parseInt(row.total_revenue_cents),
      total_quantity: parseInt(row.total_quantity),
      currency: row.currency
    }));
  }

  async getRevenueByRecipients(startDate?: Date, endDate?: Date): Promise<Array<{
    recipient_id: string;
    recipient_name: string;
    total_revenue_cents: number;
    total_orders: number;
    currency: string;
  }>> {
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
      WHERE o.status = $1
    `;
    
    const params: any[] = [OrderStatus.CONFIRMED];
    let paramIndex = 2;

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
    
    return results.map(row => ({
      recipient_id: row.recipient_id,
      recipient_name: row.recipient_name,
      total_revenue_cents: parseInt(row.total_revenue_cents),
      total_orders: parseInt(row.total_orders),
      currency: row.currency
    }));
  }

  async getTotalRevenue(startDate?: Date, endDate?: Date): Promise<{
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
      WHERE o.status = $1
    `;
    
    const params: any[] = [OrderStatus.CONFIRMED];
    let paramIndex = 2;

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
      total_revenue_cents: result ? parseInt(result.total_revenue_cents) : 0,
      total_orders: result ? parseInt(result.total_orders) : 0,
      currency: result?.currency || 'UAH'
    };
  }
}
