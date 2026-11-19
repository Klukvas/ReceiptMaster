import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Cron } from "@nestjs/schedule";
import { isUUID } from "class-validator";
import { ZodError } from "zod";
import { ApiErrors } from "../../common/errors/ApiError";
import { EnvConfig } from "../../config/env.schema";
import {
  UserSubscription,
  PlanName,
  BillingStatus,
  isBillingStatus,
  isLiveBillingStatus,
} from "../subscription/entities/user-subscription.entity";
import { CreemClient } from "./creem.client";
import {
  type CreemEvent,
  type CreemSubscription,
  isValidCreemSignature,
  parseCreemCheckout,
  parseCreemEvent,
  parseCreemSubscription,
  referenceId,
} from "./creem.webhook";

const DEFAULT_FRONTEND_URL = "http://localhost:5173";
const CHECKOUT_RETURN_PATH = "/settings?tab=subscription";

const ACTIVATION_EVENTS: ReadonlySet<string> = new Set([
  "subscription.active",
  "subscription.paid",
  "subscription.trialing",
]);

/** Events that only move the status; the plan stays until the hourly downgrade. */
const STATUS_BY_EVENT: Readonly<Record<string, BillingStatus>> = {
  "subscription.scheduled_cancel": "scheduled_cancel",
  "subscription.canceled": "canceled",
  "subscription.paused": "paused",
  "subscription.past_due": "past_due",
  "subscription.unpaid": "past_due",
};

/** Nothing is billed in these statuses, so the plan ends with the paid period. */
const UNPAID_STATUSES: readonly BillingStatus[] = ["canceled", "paused"];

type PaidPlan = Exclude<PlanName, "free">;

interface EventContext {
  eventType: string;
  /** When Creem created the event; null when the envelope carries no timestamp. */
  eventAt: Date | null;
}

@Injectable()
export class CreemService {
  private readonly logger = new Logger(CreemService.name);
  private readonly proProductId: string | undefined;
  private readonly businessProductId: string | undefined;

  constructor(
    private readonly configService: ConfigService<EnvConfig>,
    @InjectRepository(UserSubscription)
    private readonly subscriptionRepo: Repository<UserSubscription>,
    private readonly creemClient: CreemClient,
  ) {
    this.proProductId = this.configService.get("CREEM_PRO_PRODUCT_ID");
    this.businessProductId = this.configService.get(
      "CREEM_BUSINESS_PRODUCT_ID",
    );
    this.logger.log(
      this.isBillingEnabled()
        ? `Billing enabled (Creem ${this.configService.get("CREEM_ENVIRONMENT") ?? "test"})`
        : "Billing is disabled",
    );
  }

  isBillingEnabled(): boolean {
    return this.configService.get("BILLING_ENABLED", false) === true;
  }

  assertBillingEnabled(): void {
    if (!this.isBillingEnabled()) throw ApiErrors.BILLING_DISABLED();
  }

  /** The missing setting is named in the log; the caller only learns payments are unavailable. */
  private misconfigured(detail: string): Error {
    this.logger.error(`Billing is enabled but misconfigured: ${detail}`);
    return ApiErrors.BILLING_UNAVAILABLE();
  }

  private assertCreemConfigured(): void {
    this.assertBillingEnabled();
    if (!this.creemClient.isConfigured()) {
      throw this.misconfigured("CREEM_API_KEY is not set");
    }
  }

  private getProductId(plan: PaidPlan): string {
    const productId =
      plan === "pro" ? this.proProductId : this.businessProductId;
    if (!productId) {
      throw this.misconfigured(`no Creem product ID for plan ${plan}`);
    }
    return productId;
  }

  /** Returns the plan for a known product ID, or null for unknown IDs. */
  private resolvePlanFromProductId(productId: string | null): PaidPlan | null {
    if (productId && productId === this.proProductId) return "pro";
    if (productId && productId === this.businessProductId) return "business";
    this.logger.error(
      `Unknown productId "${productId}" — check CREEM_PRO_PRODUCT_ID / CREEM_BUSINESS_PRODUCT_ID env vars`,
    );
    return null;
  }

  async createCheckout(
    userId: string,
    userEmail: string,
    plan: PaidPlan,
  ): Promise<{ checkoutUrl: string }> {
    this.assertCreemConfigured();

    const existing = await this.subscriptionRepo.findOne({
      where: { user_id: userId },
    });
    // A second checkout next to a live subscription would bill the user twice.
    if (
      existing?.creem_subscription_id &&
      isLiveBillingStatus(existing.creem_status)
    ) {
      throw ApiErrors.SUBSCRIPTION_ALREADY_EXISTS();
    }

    const frontendUrl =
      this.configService.get("FRONTEND_URL") ?? DEFAULT_FRONTEND_URL;
    const checkoutUrl = await this.creemClient.createCheckout({
      productId: this.getProductId(plan),
      userId,
      customerEmail: userEmail,
      successUrl: `${frontendUrl}${CHECKOUT_RETURN_PATH}`,
    });

    return { checkoutUrl };
  }

  async createPortalSession(userId: string): Promise<{ url: string }> {
    this.assertCreemConfigured();

    const subscription = await this.subscriptionRepo.findOne({
      where: { user_id: userId },
    });
    if (
      !subscription?.creem_customer_id ||
      !subscription.creem_subscription_id
    ) {
      throw ApiErrors.SUBSCRIPTION_NOT_FOUND();
    }

    const url = await this.creemClient.createPortalLink(
      subscription.creem_customer_id,
    );
    return { url };
  }

  /**
   * A wrong signature or a body that is not a Creem event is the sender's fault (400).
   * A missing secret is ours: it surfaces as 503 so Creem retries once it is fixed.
   */
  verifyWebhook(rawBody: string, signature: string): CreemEvent {
    this.assertBillingEnabled();

    const webhookSecret = this.configService.get("CREEM_WEBHOOK_SECRET");
    if (!webhookSecret) {
      throw this.misconfigured("CREEM_WEBHOOK_SECRET is not set");
    }
    if (!isValidCreemSignature(rawBody, signature, webhookSecret)) {
      throw ApiErrors.WEBHOOK_SIGNATURE_INVALID();
    }
    try {
      return parseCreemEvent(rawBody);
    } catch (error) {
      this.logger.warn(`Signed webhook body is not a Creem event: ${error}`);
      throw ApiErrors.WEBHOOK_PAYLOAD_INVALID();
    }
  }

  async handleWebhookEvent(event: CreemEvent): Promise<void> {
    this.assertBillingEnabled();
    this.logger.log(`Processing webhook event: ${event.eventType} ${event.id}`);

    try {
      await this.dispatch(event);
    } catch (error) {
      if (!(error instanceof ZodError)) throw error;
      // A retry would carry the same malformed payload, so the event is acknowledged.
      this.logger.error(
        `Dropped ${event.eventType} ${event.id}: unexpected payload shape: ${error.message}`,
      );
    }
  }

  private async dispatch(event: CreemEvent): Promise<void> {
    const context: EventContext = {
      eventType: event.eventType,
      eventAt: event.created_at ? new Date(event.created_at) : null,
    };
    const status = STATUS_BY_EVENT[event.eventType];

    if (event.eventType === "checkout.completed") {
      await this.handleCheckoutCompleted(context, event.object);
    } else if (ACTIVATION_EVENTS.has(event.eventType)) {
      await this.activateSubscription(
        context,
        parseCreemSubscription(event.object),
        [],
      );
    } else if (event.eventType === "subscription.update") {
      await this.syncSubscription(
        context,
        parseCreemSubscription(event.object),
      );
    } else if (status) {
      await this.setStatus(
        context,
        parseCreemSubscription(event.object),
        status,
      );
    } else {
      this.logger.log(`Unhandled event type: ${event.eventType}`);
    }
  }

  /** One-time purchases carry no subscription and grant nothing here. */
  private async handleCheckoutCompleted(
    context: EventContext,
    payload: unknown,
  ): Promise<void> {
    const checkout = parseCreemCheckout(payload);
    if (!checkout.subscription) return;

    await this.activateSubscription(
      context,
      {
        ...checkout.subscription,
        product: checkout.subscription.product ?? checkout.product,
        customer: checkout.subscription.customer ?? checkout.customer,
      },
      [checkout.metadata],
    );
  }

  /**
   * Links the paid subscription to the user named in the checkout metadata. Renewals may
   * arrive without metadata, so an already linked subscription is matched by its id.
   */
  private async activateSubscription(
    context: EventContext,
    data: CreemSubscription,
    fallbackMetadata: readonly (Record<string, unknown> | null | undefined)[],
  ): Promise<void> {
    const plan = this.resolvePlanFromProductId(referenceId(data.product));
    // A product this app does not sell must not grant a plan.
    if (!plan) return;

    const userId = findUserId([data.metadata, ...fallbackMetadata]);
    const subscription = await this.subscriptionRepo.findOne({
      where: userId ? { user_id: userId } : { creem_subscription_id: data.id },
    });
    if (!subscription) {
      this.logger.error(
        `${context.eventType}: no subscription row for userId=${userId} subscription=${data.id}. Payment recorded in Creem but NOT applied locally.`,
      );
      return;
    }
    if (this.isStale(context, subscription, data.id)) return;

    const isSameSubscription = subscription.creem_subscription_id === data.id;
    if (
      !isSameSubscription &&
      subscription.creem_subscription_id &&
      isLiveBillingStatus(subscription.creem_status)
    ) {
      this.logger.error(
        `${context.eventType}: user ${subscription.user_id} now has two live Creem subscriptions: ${subscription.creem_subscription_id} and ${data.id}. Cancel one in Creem.`,
      );
    }

    await this.subscriptionRepo.update(
      { id: subscription.id },
      {
        creem_customer_id:
          referenceId(data.customer) ??
          (isSameSubscription ? subscription.creem_customer_id : null),
        creem_subscription_id: data.id,
        creem_status: data.status === "trialing" ? "trialing" : "active",
        plan,
        // A renewal without a date must not erase the one a later cancel relies on.
        current_period_end:
          toDate(data.current_period_end_date) ??
          (isSameSubscription ? subscription.current_period_end : null),
        creem_event_at: context.eventAt ?? subscription.creem_event_at,
      },
    );

    this.logger.log(
      `${context.eventType}: subscription ${data.id} active, plan=${plan}`,
    );
  }

  private async syncSubscription(
    context: EventContext,
    data: CreemSubscription,
  ): Promise<void> {
    const subscription = await this.findBySubscriptionId(context, data.id);
    if (!subscription) return;

    // Keep the existing plan and status when the payload carries unknown values.
    const plan =
      this.resolvePlanFromProductId(referenceId(data.product)) ??
      subscription.plan;
    const status = isBillingStatus(data.status)
      ? data.status
      : subscription.creem_status;

    await this.applyUpdate(context, subscription, data, {
      plan,
      creem_status: status,
    });
  }

  /** The plan stays until the hourly downgrade: access runs to the end of the paid period. */
  private async setStatus(
    context: EventContext,
    data: CreemSubscription,
    status: BillingStatus,
  ): Promise<void> {
    const subscription = await this.findBySubscriptionId(context, data.id);
    if (!subscription) return;

    await this.applyUpdate(context, subscription, data, {
      creem_status: status,
    });
  }

  private async applyUpdate(
    context: EventContext,
    subscription: UserSubscription,
    data: CreemSubscription,
    changes: Pick<UserSubscription, "creem_status"> &
      Partial<Pick<UserSubscription, "plan">>,
  ): Promise<void> {
    await this.subscriptionRepo.update(
      { id: subscription.id },
      {
        ...changes,
        current_period_end:
          toDate(data.current_period_end_date) ??
          subscription.current_period_end,
        creem_event_at: context.eventAt ?? subscription.creem_event_at,
      },
    );

    this.logger.log(
      `${context.eventType}: user ${subscription.user_id} is now ${changes.creem_status}`,
    );
  }

  private async findBySubscriptionId(
    context: EventContext,
    subscriptionId: string,
  ): Promise<UserSubscription | null> {
    const subscription = await this.subscriptionRepo.findOne({
      where: { creem_subscription_id: subscriptionId },
    });
    if (!subscription) {
      this.logger.warn(
        `${context.eventType}: no subscription found for ${subscriptionId}`,
      );
      return null;
    }
    return this.isStale(context, subscription, subscriptionId)
      ? null
      : subscription;
  }

  /**
   * Creem retries a failed delivery for hours, so an event can arrive after newer ones:
   * a retried payment after the cancellation, or an old subscription's event after a new
   * purchase. Applying it would undo the newer state.
   */
  private isStale(
    context: EventContext,
    subscription: UserSubscription,
    subscriptionId: string,
  ): boolean {
    const isOlder =
      context.eventAt !== null &&
      subscription.creem_event_at !== null &&
      context.eventAt < subscription.creem_event_at;
    if (isOlder) {
      this.logger.warn(
        `${context.eventType}: ignored for ${subscriptionId}, a newer event was already applied`,
      );
    }
    return isOlder;
  }

  /**
   * Cron: every hour, move subscriptions that are no longer billed to free once the paid
   * period is over (one bulk UPDATE). Without a known period end there is nothing left to
   * honour. `creem_event_at` is kept so a late replay cannot restore the plan.
   */
  @Cron("0 * * * *")
  async downgradeCanceledSubscriptions(): Promise<void> {
    if (!this.isBillingEnabled()) return;
    const result = await this.subscriptionRepo
      .createQueryBuilder()
      .update(UserSubscription)
      .set({
        plan: "free",
        creem_status: null,
        creem_subscription_id: null,
        creem_customer_id: null,
        current_period_end: null,
      })
      .where("creem_status IN (:...statuses)", { statuses: UNPAID_STATUSES })
      .andWhere("(current_period_end IS NULL OR current_period_end < :now)", {
        now: new Date(),
      })
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.log(
        `Downgraded ${result.affected} expired subscription(s) to free`,
      );
    }
  }
}

/** The first metadata that names a user by UUID; the value comes from outside, so it is checked. */
function findUserId(
  metadataList: readonly (Record<string, unknown> | null | undefined)[],
): string | null {
  for (const metadata of metadataList) {
    const userId = metadata?.userId;
    if (typeof userId === "string" && isUUID(userId)) return userId;
  }
  return null;
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
