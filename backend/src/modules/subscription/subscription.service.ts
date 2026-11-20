import { Injectable } from "@nestjs/common";
import { InjectRepository, InjectDataSource } from "@nestjs/typeorm";
import { Repository, DataSource, EntityManager } from "typeorm";
import { ApiErrors } from "../../common/errors/ApiError";
import {
  UserSubscription,
  PlanName,
  BillingStatus,
} from "./entities/user-subscription.entity";
import { PLAN_LIMITS, PlanFeature, PlanLimits } from "./config/plans.config";
import {
  assertPlanFeature,
  isTemplateAllowed,
  planDefaults,
  readPlanLimits,
} from "./plan-access";
import { Recipient } from "../recipients/entities/recipient.entity";
import { Product } from "../products/entities/product.entity";
import { Order, OrderStatus } from "../orders/entities/order.entity";

export interface SubscriptionStatus {
  plan: PlanName;
  usage: {
    productsCount: number;
    ordersThisMonth: number;
    recipientsCount: number;
  };
  limits: PlanLimits;
  billingStatus: BillingStatus | null;
  currentPeriodEnd: string | null;
  hasBillingSubscription: boolean;
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
      .values({ user_id: userId, plan: planDefaults.withoutSubscription })
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
    return (
      this.orderRepository
        .createQueryBuilder("order")
        .where("order.user_id = :userId", { userId })
        .andWhere(
          "order.created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC')",
        )
        .andWhere("order.deleted_at IS NULL")
        // A cancelled order frees its place in the quota, as it already gives its stock back.
        .andWhere("order.status <> :cancelled", {
          cancelled: OrderStatus.CANCELLED,
        })
        .getCount()
    );
  }

  async getStatus(userId: string): Promise<SubscriptionStatus> {
    const subscription = await this.getOrCreate(userId);
    // A plan name this build does not know reads as free, like every other plan check.
    const limits = PLAN_LIMITS[subscription.plan] ?? PLAN_LIMITS.free;

    const [productsCount, ordersThisMonth, recipientsCount] = await Promise.all(
      [
        this.countProducts(userId),
        this.countOrdersThisMonth(userId),
        this.dataSource.manager.count(Recipient, {
          where: { user_id: userId },
        }),
      ],
    );

    return {
      plan: subscription.plan,
      usage: { productsCount, ordersThisMonth, recipientsCount },
      limits,
      billingStatus: subscription.creem_status ?? null,
      currentPeriodEnd: subscription.current_period_end
        ? subscription.current_period_end.toISOString()
        : null,
      hasBillingSubscription: !!subscription.creem_subscription_id,
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
    const limits = await readPlanLimits(manager, userId);

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
    const limits = await readPlanLimits(manager, userId);

    if (limits.maxOrdersPerMonth === null) return;

    const count = await manager
      .createQueryBuilder(Order, "order")
      .where("order.user_id = :userId", { userId })
      .andWhere(
        "order.created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC')",
      )
      .andWhere("order.deleted_at IS NULL")
      // A cancelled order frees its place in the quota, as it already gives its stock back.
      .andWhere("order.status <> :cancelled", {
        cancelled: OrderStatus.CANCELLED,
      })
      .getCount();

    if (count >= limits.maxOrdersPerMonth) {
      throw ApiErrors.ORDER_MONTHLY_LIMIT_EXCEEDED(limits.maxOrdersPerMonth);
    }
  }

  /**
   * Quota check for a recipient insert in the caller's transaction, serialized per user the
   * same way as products. Recipients are hard-deleted, so the count is exact.
   */
  async assertCanCreateRecipientInTx(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    await manager.query(
      "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
      ["recipient-quota", userId],
    );
    const limits = await readPlanLimits(manager, userId);
    if (limits.maxRecipients === null) return;

    const count = await manager.count(Recipient, {
      where: { user_id: userId },
    });
    if (count >= limits.maxRecipients) {
      throw ApiErrors.RECIPIENT_LIMIT_EXCEEDED(limits.maxRecipients);
    }
  }

  /** The account's limits; a missing subscription row reads as the free plan. */
  getPlanLimits(
    userId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<PlanLimits> {
    return readPlanLimits(manager, userId);
  }

  assertFeature(
    userId: string,
    feature: PlanFeature,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<void> {
    return assertPlanFeature(manager, userId, feature);
  }

  async getAllowedTemplateIds(
    userId: string,
  ): Promise<readonly string[] | null> {
    return (await this.getPlanLimits(userId)).allowedTemplateIds;
  }

  async assertCanUseTemplate(
    userId: string,
    templateId: string,
  ): Promise<void> {
    if (!isTemplateAllowed(await this.getPlanLimits(userId), templateId)) {
      throw ApiErrors.TEMPLATE_PLAN_RESTRICTED(templateId);
    }
  }
}
