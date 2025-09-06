import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from "typeorm";
import { Recipient } from "../../recipients/entities/recipient.entity";
import { OrderItem } from "./order-item.entity";
import { Receipt } from "../../receipts/entities/receipt.entity";

export enum OrderStatus {
  DRAFT = "draft",
  CONFIRMED = "confirmed",
  CANCELLED = "cancelled",
}

@Entity("orders")
@Index(["recipient_id"])
@Index(["created_at"])
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

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Recipient, (recipient) => recipient.orders, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "recipient_id" })
  recipient: Recipient;

  @OneToMany(() => OrderItem, (orderItem) => orderItem.order, {
    onDelete: "CASCADE",
  })
  items: OrderItem[];

  @OneToMany(() => Receipt, (receipt) => receipt.order, { onDelete: "CASCADE" })
  receipts: Receipt[];
}
