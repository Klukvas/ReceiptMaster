import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { Order } from "../../orders/entities/order.entity";
import { User } from "../../users/entities/user.entity";

export enum ReceiptStatus {
  PROCESSING = "processing",
  GENERATED = "generated",
  VOID = "void",
}

@Entity("receipts")
@Index(["order_id"], { unique: true })
@Index(["number"], { unique: true })
@Index(["user_id", "created_at"])
export class Receipt {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid", unique: true })
  order_id: string;

  @Column({ type: "varchar", length: 50, unique: true })
  number: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  pdf_url?: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  pdf_path?: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  hash?: string;

  @Column({
    type: "enum",
    enum: ReceiptStatus,
    default: ReceiptStatus.GENERATED,
  })
  status: ReceiptStatus;

  @Column({ type: "text", nullable: true })
  html_snapshot?: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  template_id?: string;

  @Column({ type: "integer", default: 1, nullable: true })
  template_version?: number;

  @Column({ type: "timestamp", nullable: true })
  voided_at?: Date;

  @Column({ type: "varchar", length: 500, nullable: true })
  void_reason?: string;

  @Column({ type: "integer", default: 0 })
  progress: number;

  @Column({ type: "varchar", length: 1000, nullable: true })
  error_message?: string;

  @Column({ type: "uuid" })
  user_id: string;

  @ManyToOne(() => User, (user) => user.receipts)
  @JoinColumn({ name: "user_id" })
  user: User;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Order, (order) => order.receipts)
  @JoinColumn({ name: "order_id" })
  order: Order;
}
