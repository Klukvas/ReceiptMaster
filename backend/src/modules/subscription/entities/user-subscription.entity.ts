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

@Entity("user_subscriptions")
export class UserSubscription {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid", unique: true })
  user_id: string;

  @Column({ type: "varchar", length: 20, default: "free" })
  plan: PlanName;

  @Column({ type: "varchar", length: 255, nullable: true })
  paddle_customer_id: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  paddle_subscription_id: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  paddle_status: string | null;

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
