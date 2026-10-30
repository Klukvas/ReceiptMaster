import { Injectable } from "@nestjs/common";
import { InjectRepository, InjectDataSource } from "@nestjs/typeorm";
import { Repository, DataSource, EntityManager } from "typeorm";
import { ApiErrors } from "../../common/errors/ApiError";
import {
  UserSubscription,
  PlanName,
} from "./entities/user-subscription.entity";
import { PLAN_LIMITS, PlanLimits } from "./config/plans.config";
import { Product } from "../products/entities/product.entity";
import { Order } from "../orders/entities/order.entity";

export interface SubscriptionStatus {
  plan: PlanName;
  usage: {
    productsCount: number;
    ordersThisMonth: number;
  };
  limits: PlanLimits;
  paddleStatus: string | null;
  currentPeriodEnd: string | null;
  hasPaddleSubscription: boolean;
}

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(UserSubscription)
    private subscriptionRepository: Repository<UserSubscription>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  private async getOrCreate(userId: string): Promise<UserSubscription> {
    const existing = await this.subscriptionRepository.findOne({
      where: { user_id: userId },
    });
    if (existing) return existing;

    await this.subscriptionRepository
      .createQueryBuilder()
      .insert()
      .into(UserSubscription)
      .values({ user_id: userId, plan: "free" })
      .orIgnore()
      .execute();

    return this.subscriptionRepository.findOneOrFail({
      where: { user_id: userId },
    });
  }

  private async countProducts(userId: string): Promise<number> {
    return this.productRepository.count({ where: { user_id: userId } });
  }

  private async countOrdersThisMonth(userId: string): Promise<number> {
    return this.orderRepository
      .createQueryBuilder("order")
      .where("order.user_id = :userId", { userId })
      .andWhere(
        "order.created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC')",
      )
      .andWhere("order.deleted_at IS NULL")
      .getCount();
  }

  async getStatus(userId: string): Promise<SubscriptionStatus> {
    const subscription = await this.getOrCreate(userId);
    const limits = PLAN_LIMITS[subscription.plan];

    const [productsCount, ordersThisMonth] = await Promise.all([
      this.countProducts(userId),
      this.countOrdersThisMonth(userId),
    ]);

    return {
      plan: subscription.plan,
      usage: { productsCount, ordersThisMonth },
      limits,
      paddleStatus: subscription.paddle_status ?? null,
      currentPeriodEnd: subscription.current_period_end
        ? subscription.current_period_end.toISOString()
        : null,
      hasPaddleSubscription: !!subscription.paddle_subscription_id,
    };
  }

  /**
   * Quota check for a product insert in the caller's transaction. The per-user
   * advisory lock is held until commit, so concurrent creates count one after
   * another; a rolled-back insert releases its slot with the lock. It reads the
   * plan without creating a subscription row (a missing row is the free plan).
   */
  async assertCanCreateProductInTx(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    await manager.query(
      "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
      ["product-quota", userId],
    );
    const subscription = await manager.findOne(UserSubscription, {
      where: { user_id: userId },
    });
    const limits = PLAN_LIMITS[subscription?.plan ?? "free"];

    if (limits.maxProducts === null) return;

    // The ORM count skips soft-deleted products, matching the plan's policy.
    const count = await manager.count(Product, { where: { user_id: userId } });
    if (count >= limits.maxProducts) {
      throw ApiErrors.PRODUCT_LIMIT_EXCEEDED(limits.maxProducts);
    }
  }

  async assertCanCreateOrder(userId: string): Promise<void> {
    const subscription = await this.getOrCreate(userId);
    const limits = PLAN_LIMITS[subscription.plan];

    if (limits.maxOrdersPerMonth === null) return;

    const count = await this.countOrdersThisMonth(userId);
    if (count >= limits.maxOrdersPerMonth) {
      throw ApiErrors.ORDER_MONTHLY_LIMIT_EXCEEDED(limits.maxOrdersPerMonth);
    }
  }

  async assertCanCreateOrderInTx(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    // A row lock cannot serialize users without a subscription row. Hold this
    // per-user lock until the caller commits the quota check and order insert.
    await manager.query(
      "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
      ["order-monthly-quota", userId],
    );
    const subscription = await manager.findOne(UserSubscription, {
      where: { user_id: userId },
    });
    const plan = subscription?.plan ?? "free";
    const limits = PLAN_LIMITS[plan];

    if (limits.maxOrdersPerMonth === null) return;

    const count = await manager
      .createQueryBuilder(Order, "order")
      .where("order.user_id = :userId", { userId })
      .andWhere(
        "order.created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC')",
      )
      .andWhere("order.deleted_at IS NULL")
      .getCount();

    if (count >= limits.maxOrdersPerMonth) {
      throw ApiErrors.ORDER_MONTHLY_LIMIT_EXCEEDED(limits.maxOrdersPerMonth);
    }
  }

  async getAllowedTemplateIds(userId: string): Promise<string[] | null> {
    const subscription = await this.getOrCreate(userId);
    return PLAN_LIMITS[subscription.plan].allowedTemplateIds;
  }

  async assertCanUseTemplate(
    userId: string,
    templateId: string,
  ): Promise<void> {
    const allowed = await this.getAllowedTemplateIds(userId);
    if (allowed === null) return;

    if (!allowed.includes(templateId)) {
      throw ApiErrors.TEMPLATE_PLAN_RESTRICTED(templateId);
    }
  }
}
