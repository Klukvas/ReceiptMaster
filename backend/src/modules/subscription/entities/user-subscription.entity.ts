import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "../../users/entities/user.entity";

export type PlanName = "free" | "pro" | "business";

export const BILLING_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "scheduled_cancel",
  "paused",
  "canceled",
] as const;

/** Subscription status as stored from the payment provider's events. */
export type BillingStatus = (typeof BILLING_STATUSES)[number];

export const isBillingStatus = (value: unknown): value is BillingStatus =>
  BILLING_STATUSES.includes(value as BillingStatus);

/** Every status but `canceled` still has a subscription the user manages in the portal. */
export const isLiveBillingStatus = (status: BillingStatus | null): boolean =>
  status !== null && status !== "canceled";

@Entity("user_subscriptions")
export class UserSubscription {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid", unique: true })
  user_id: string;

  @Column({ type: "varchar", length: 20, default: "free" })
  plan: PlanName;

  @Column({ type: "varchar", length: 255, nullable: true })
  creem_customer_id: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  creem_subscription_id: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  creem_status: BillingStatus | null;

  /** When the provider created the last applied event; older events are ignored as replays. */
  @Column({ type: "timestamptz", nullable: true })
  creem_event_at: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  current_period_end: Date | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user: User;

  @CreateDateColumn({ type: "timestamptz" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at: Date;
}
