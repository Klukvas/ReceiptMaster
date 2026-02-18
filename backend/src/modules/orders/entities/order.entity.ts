import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from "typeorm";
import { Recipient } from "../../recipients/entities/recipient.entity";
import { OrderItem } from "./order-item.entity";
import { Receipt } from "../../receipts/entities/receipt.entity";
import { User } from "../../users/entities/user.entity";

export enum OrderStatus {
  DRAFT = "draft",
  CONFIRMED = "confirmed",
  CANCELLED = "cancelled",
}

export enum PaymentStatus {
  UNPAID = "unpaid",
  PAID = "paid",
  REFUNDED = "refunded",
}

@Entity("orders")
@Index(["recipient_id"])
@Index(["created_at"])
@Index(["user_id", "status"])
@Index(["user_id", "created_at"])
export class Order {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  recipient_id: string;

  @Column({ type: "enum", enum: OrderStatus, default: OrderStatus.DRAFT })
  status: OrderStatus;

  @Column({ type: "integer" })
  subtotal_cents: number;

  @Column({ type: "integer" })
  total_cents: number;

  @Column({ type: "varchar", length: 3 })
  currency: string;

  @Column({ type: "varchar", length: 50, default: "manually" })
  created_by: string;

  @Column({ type: "uuid" })
  user_id: string;

  @ManyToOne(() => User, (user) => user.orders)
  @JoinColumn({ name: "user_id" })
  user: User;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at?: Date;

  @Column({
    type: "enum",
    enum: PaymentStatus,
    default: PaymentStatus.UNPAID,
  })
  payment_status: PaymentStatus;

  @Column({ type: "boolean", default: false })
  is_locked: boolean;

  @ManyToOne(() => Recipient, (recipient) => recipient.orders, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "recipient_id" })
  recipient: Recipient;

  @OneToMany(() => OrderItem, (orderItem) => orderItem.order, {
    onDelete: "CASCADE",
  })
  items: OrderItem[];

  @OneToMany("Receipt", "order", { onDelete: "CASCADE" })
  receipts: Receipt[];
}
