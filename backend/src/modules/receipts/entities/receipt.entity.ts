import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { ApiHideProperty, ApiProperty } from "@nestjs/swagger";
import { Order } from "../../orders/entities/order.entity";
import { User } from "../../users/entities/user.entity";

export enum ReceiptStatus {
  PROCESSING = "processing",
  GENERATED = "generated",
  VOID = "void",
  FAILED = "failed",
}

@Entity("receipts")
@Index(["order_id"], { unique: true })
@Index(["number"], { unique: true })
@Index(["user_id", "created_at"])
export class Receipt {
  @ApiProperty()
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ApiProperty()
  @Column({ type: "uuid", unique: true })
  order_id: string;

  @ApiProperty()
  @Column({ type: "varchar", length: 50, unique: true })
  number: string;

  @ApiProperty({ required: false })
  @Column({ type: "varchar", length: 500, nullable: true })
  pdf_url?: string;

  @ApiProperty({ required: false })
  @Column({ type: "varchar", length: 500, nullable: true })
  pdf_path?: string;

  @ApiProperty({ required: false })
  @Column({ type: "varchar", length: 64, nullable: true })
  hash?: string;

  @ApiProperty({ enum: ReceiptStatus })
  @Column({
    type: "enum",
    enum: ReceiptStatus,
    default: ReceiptStatus.GENERATED,
  })
  status: ReceiptStatus;

  @ApiProperty({ required: false })
  @Column({ type: "text", nullable: true })
  html_snapshot?: string;

  @ApiProperty({ required: false })
  @Column({ type: "varchar", length: 50, nullable: true })
  template_id?: string;

  @ApiProperty({ required: false })
  @Column({ type: "integer", default: 1, nullable: true })
  template_version?: number;

  @ApiProperty({ required: false })
  @Column({ type: "timestamp", nullable: true })
  voided_at?: Date;

  @ApiProperty({ required: false })
  @Column({ type: "varchar", length: 500, nullable: true })
  void_reason?: string;

  @ApiProperty({ required: false })
  @Column({ type: "varchar", length: 64, nullable: true, unique: true })
  public_token?: string;

  @ApiProperty()
  @Column({ type: "integer", default: 0 })
  progress: number;

  @ApiProperty({ required: false })
  @Column({ type: "varchar", length: 1000, nullable: true })
  error_message?: string;

  @ApiHideProperty()
  @Column({ type: "uuid" })
  user_id: string;

  @ApiHideProperty()
  @ManyToOne(() => User, (user) => user.receipts)
  @JoinColumn({ name: "user_id" })
  user: User;

  @ApiProperty()
  @CreateDateColumn()
  created_at: Date;

  @ApiProperty({ type: () => Order })
  @ManyToOne(() => Order, (order) => order.receipts)
  @JoinColumn({ name: "order_id" })
  order: Order;
}
