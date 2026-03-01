import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Cron } from "@nestjs/schedule";
import {
  Paddle,
  Environment,
  EventName,
  type EventEntity,
  type SubscriptionNotification,
} from "@paddle/paddle-node-sdk";
import { EnvConfig } from "../../config/env.schema";
import {
  UserSubscription,
  PlanName,
} from "../subscription/entities/user-subscription.entity";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class PaddleService {
  private readonly logger = new Logger(PaddleService.name);
  private readonly paddle: Paddle | null;
  private readonly proPriceId: string | undefined;
  private readonly businessPriceId: string | undefined;

  constructor(
    private readonly configService: ConfigService<EnvConfig>,
    @InjectRepository(UserSubscription)
    private readonly subscriptionRepo: Repository<UserSubscription>,
  ) {
    const apiKey = this.configService.get("PADDLE_API_KEY");

    if (apiKey) {
      const env = this.configService.get("PADDLE_ENVIRONMENT");
      this.paddle = new Paddle(apiKey, {
        environment:
          env === "production" ? Environment.production : Environment.sandbox,
      });
      this.logger.log(`Paddle SDK initialized (${env})`);
    } else {
      this.paddle = null;
      this.logger.warn("PADDLE_API_KEY not set — Paddle integration disabled");
    }

    this.proPriceId = this.configService.get("PADDLE_PRO_PRICE_ID");
    this.businessPriceId = this.configService.get("PADDLE_BUSINESS_PRICE_ID");
  }

  private assertPaddleConfigured(): Paddle {
    if (!this.paddle) {
      throw new BadRequestException("Paddle integration is not configured");
    }
    return this.paddle;
  }

  private getPriceId(plan: "pro" | "business"): string {
    const priceId = plan === "pro" ? this.proPriceId : this.businessPriceId;
    if (!priceId) {
      throw new BadRequestException(
        `Price ID not configured for plan: ${plan}`,
      );
    }
    return priceId;
  }

  /** Returns the plan for a known price ID, or null for unknown IDs. */
  private resolvePlanFromPriceId(priceId: string): PlanName | null {
    if (priceId === this.proPriceId) return "pro";
    if (priceId === this.businessPriceId) return "business";
    this.logger.error(
      `Unknown priceId "${priceId}" — check PADDLE_PRO_PRICE_ID / PADDLE_BUSINESS_PRICE_ID env vars`,
    );
    return null;
  }

  async createCheckoutTransaction(
    userId: string,
    userEmail: string,
    plan: "pro" | "business",
  ): Promise<{ transactionId: string }> {
    const paddle = this.assertPaddleConfigured();

    // H2: Idempotency — reject if user already has an active Paddle subscription
    const existing = await this.subscriptionRepo.findOne({
      where: { user_id: userId },
    });
    if (
      existing?.paddle_subscription_id &&
      existing.paddle_status === "active"
    ) {
      throw new BadRequestException(
        "An active subscription already exists. Use the billing portal to change plans.",
      );
    }

    const priceId = this.getPriceId(plan);

    const transaction = await paddle.transactions.create({
      items: [{ priceId, quantity: 1 }],
      customData: { userId },
      checkout: {
        url: this.configService.get("FRONTEND_URL") ?? "http://localhost:5173",
      },
    });

    return { transactionId: transaction.id };
  }

  async createPortalSession(userId: string): Promise<{ url: string }> {
    const paddle = this.assertPaddleConfigured();

    const subscription = await this.subscriptionRepo.findOne({
      where: { user_id: userId },
    });

    if (
      !subscription?.paddle_customer_id ||
      !subscription.paddle_subscription_id
    ) {
      throw new BadRequestException("No active Paddle subscription found");
    }

    const portalSession = await paddle.customerPortalSessions.create(
      subscription.paddle_customer_id,
      [subscription.paddle_subscription_id],
    );

    return { url: portalSession.urls.general.overview };
  }

  async verifyWebhook(
    rawBody: string,
    signature: string,
  ): Promise<EventEntity> {
    const paddle = this.assertPaddleConfigured();

    const webhookSecret = this.configService.get("PADDLE_WEBHOOK_SECRET");
    if (!webhookSecret) {
      throw new BadRequestException("Webhook secret not configured");
    }

    return paddle.webhooks.unmarshal(rawBody, webhookSecret, signature);
  }

  async handleWebhookEvent(event: EventEntity): Promise<void> {
    this.logger.log(`Processing webhook event: ${event.eventType}`);

    switch (event.eventType) {
      case EventName.SubscriptionCreated:
      case EventName.SubscriptionActivated:
        await this.handleSubscriptionCreated(
          event.data as SubscriptionNotification,
        );
        break;
      case EventName.SubscriptionUpdated:
        await this.handleSubscriptionUpdated(
          event.data as SubscriptionNotification,
        );
        break;
      case EventName.SubscriptionCanceled:
        await this.handleSubscriptionCanceled(
          event.data as SubscriptionNotification,
        );
        break;
      case EventName.SubscriptionPastDue:
        await this.handleSubscriptionPastDue(
          event.data as SubscriptionNotification,
        );
        break;
      default:
        this.logger.log(`Unhandled event type: ${event.eventType}`);
    }
  }

  private async handleSubscriptionCreated(
    data: SubscriptionNotification,
  ): Promise<void> {
    const userId = (data.customData as Record<string, unknown>)?.userId as
      | string
      | undefined;

    // C4: Validate userId format
    if (!userId || !UUID_REGEX.test(userId)) {
      this.logger.error(
        `subscription.created: invalid or missing userId in customData: "${userId}"`,
      );
      return;
    }

    const priceId = data.items?.[0]?.price?.id as string | undefined;
    const resolvedPlan = priceId ? this.resolvePlanFromPriceId(priceId) : null;
    // M1: If price ID is unknown, default to keeping existing plan rather than downgrading
    const plan = resolvedPlan ?? "pro";
    const periodEnd = data.currentBillingPeriod?.endsAt ?? null;

    // C3: Check affected rows — payment recorded in Paddle but user not found locally
    const result = await this.subscriptionRepo.update(
      { user_id: userId },
      {
        paddle_customer_id: data.customerId,
        paddle_subscription_id: data.id,
        paddle_status: "active",
        plan,
        current_period_end: periodEnd ? new Date(periodEnd) : null,
      },
    );

    if (result.affected === 0) {
      this.logger.error(
        `subscription.created: no subscription row for userId=${userId}. Payment recorded in Paddle but NOT applied locally.`,
      );
      return;
    }

    this.logger.log(`Subscription created for user ${userId}: plan=${plan}`);
  }

  private async handleSubscriptionUpdated(
    data: SubscriptionNotification,
  ): Promise<void> {
    const subscriptionId = data.id;
    const subscription = await this.subscriptionRepo.findOne({
      where: { paddle_subscription_id: subscriptionId },
    });

    if (!subscription) {
      this.logger.warn(
        `subscription.updated: no subscription found for ${subscriptionId}`,
      );
      return;
    }

    const priceId = data.items?.[0]?.price?.id as string | undefined;
    const resolvedPlan = priceId ? this.resolvePlanFromPriceId(priceId) : null;
    // Keep existing plan if price ID is unknown
    const plan = resolvedPlan ?? subscription.plan;
    const periodEnd = data.currentBillingPeriod?.endsAt ?? null;
    const status = data.status ?? subscription.paddle_status;

    await this.subscriptionRepo.update(
      { id: subscription.id },
      {
        plan,
        paddle_status: status,
        current_period_end: periodEnd ? new Date(periodEnd) : null,
      },
    );

    this.logger.log(
      `Subscription updated for user ${subscription.user_id}: plan=${plan}, status=${status}`,
    );
  }

  private async handleSubscriptionCanceled(
    data: SubscriptionNotification,
  ): Promise<void> {
    const subscriptionId = data.id;
    const subscription = await this.subscriptionRepo.findOne({
      where: { paddle_subscription_id: subscriptionId },
    });

    if (!subscription) {
      this.logger.warn(
        `subscription.canceled: no subscription found for ${subscriptionId}`,
      );
      return;
    }

    const periodEnd = data.currentBillingPeriod?.endsAt ?? null;

    await this.subscriptionRepo.update(
      { id: subscription.id },
      {
        paddle_status: "canceled",
        current_period_end: periodEnd
          ? new Date(periodEnd)
          : subscription.current_period_end,
      },
    );

    this.logger.log(
      `Subscription canceled for user ${subscription.user_id}, access until ${periodEnd ?? "now"}`,
    );
  }

  private async handleSubscriptionPastDue(
    data: SubscriptionNotification,
  ): Promise<void> {
    const subscriptionId = data.id;

    const result = await this.subscriptionRepo.update(
      { paddle_subscription_id: subscriptionId },
      { paddle_status: "past_due" },
    );

    if (result.affected === 0) {
      this.logger.warn(
        `subscription.past_due: no subscription found for ${subscriptionId}`,
      );
    } else {
      this.logger.log(
        `Subscription past_due for paddle subscription ${subscriptionId}`,
      );
    }
  }

  /**
   * Cron: every hour, downgrade canceled subscriptions past their period end.
   * C5: Single atomic bulk UPDATE instead of N+1 loop.
   */
  @Cron("0 * * * *")
  async downgradeCanceledSubscriptions(): Promise<void> {
    const result = await this.subscriptionRepo
      .createQueryBuilder()
      .update(UserSubscription)
      .set({
        plan: "free",
        paddle_status: null,
        paddle_subscription_id: null,
        paddle_customer_id: null,
        current_period_end: null,
      })
      .where("paddle_status = :status", { status: "canceled" })
      .andWhere("current_period_end < :now", { now: new Date() })
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.log(
        `Downgraded ${result.affected} expired subscription(s) to free`,
      );
    }
  }
}
