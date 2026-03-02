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
import { ApiHideProperty, ApiProperty } from "@nestjs/swagger";
import { Recipient } from "../../recipients/entities/recipient.entity";
import { OrderItem } from "./order-item.entity";
import { Receipt } from "../../receipts/entities/receipt.entity";
import { User } from "../../users/entities/user.entity";

export enum OrderStatus {
  DRAFT = "draft",
  CONFIRMED = "confirmed",
  CANCELLED = "cancelled",
}

@Entity("orders")
@Index(["recipient_id"])
@Index(["created_at"])
@Index(["user_id", "status"])
@Index(["user_id", "created_at"])
export class Order {
  @ApiProperty()
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ApiProperty()
  @Column({ type: "uuid" })
  recipient_id: string;

  @ApiProperty({ enum: OrderStatus })
  @Column({ type: "enum", enum: OrderStatus, default: OrderStatus.DRAFT })
  status: OrderStatus;

  @ApiProperty()
  @Column({ type: "integer" })
  subtotal_cents: number;

  @ApiProperty()
  @Column({ type: "integer" })
  total_cents: number;

  @ApiProperty()
  @Column({ type: "varchar", length: 3 })
  currency: string;

  @ApiProperty()
  @Column({ type: "varchar", length: 50, default: "manually" })
  created_by: string;

  @ApiHideProperty()
  @Column({ type: "uuid" })
  user_id: string;

  @ApiHideProperty()
  @ManyToOne(() => User, (user) => user.orders)
  @JoinColumn({ name: "user_id" })
  user: User;

  @ApiProperty()
  @CreateDateColumn()
  created_at: Date;

  @ApiProperty()
  @UpdateDateColumn()
  updated_at: Date;

  @ApiProperty({ required: false })
  @DeleteDateColumn()
  deleted_at?: Date;

  @ApiProperty()
  @Column({ type: "boolean", default: false })
  is_locked: boolean;

  @ApiProperty({ type: () => Recipient })
  @ManyToOne(() => Recipient, (recipient) => recipient.orders, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "recipient_id" })
  recipient: Recipient;

  @ApiProperty({ type: () => [OrderItem] })
  @OneToMany(() => OrderItem, (orderItem) => orderItem.order, {
    onDelete: "CASCADE",
  })
  items: OrderItem[];

  @ApiProperty({ type: () => [Receipt] })
  @OneToMany("Receipt", "order", { onDelete: "CASCADE" })
  receipts: Receipt[];
}
