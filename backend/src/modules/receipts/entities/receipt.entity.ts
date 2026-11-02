import type { RenderSnapshot } from "../services/document-render.service";
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
@Index(["user_id", "number"], { unique: true })
@Index(["user_id", "created_at"])
export class Receipt {
  @ApiProperty()
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ApiProperty()
  @Column({ type: "uuid", unique: true })
  order_id: string;

  @ApiProperty()
  @Column({ type: "varchar", length: 50 })
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
  @Column({ type: "text", nullable: true, select: false })
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
  public_token?: string | null;

  @ApiHideProperty()
  @Column({ type: "uuid", nullable: true })
  generation_id?: string;

  @ApiHideProperty()
  @Column({ type: "timestamptz", nullable: true })
  generation_started_at?: Date;

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

  @Column({ type: "integer", default: 0 }) active_revision: number;
  @Column({ type: "jsonb", nullable: true, select: false })
  active_snapshot: RenderSnapshot | null;
  @Column({ type: "jsonb", nullable: true, select: false })
  pending_snapshot: RenderSnapshot | null;
  @Column({ type: "text", nullable: true, select: false }) pending_html:
    | string
    | null;
  @Column({ type: "uuid", nullable: true, select: false }) pending_id:
    | string
    | null;
  @Column({ type: "integer", nullable: true, select: false })
  pending_expected_revision: number | null;
  @Column({ type: "varchar", length: 20, nullable: true }) replacement_status:
    | "processing"
    | "failed"
    | null;
  @Column({ type: "varchar", length: 500, nullable: true }) replacement_error:
    | string
    | null;
  @Column({ type: "uuid", nullable: true, select: false })
  active_logo_asset_id: string | null;
  @Column({ type: "uuid", nullable: true, select: false })
  pending_logo_asset_id: string | null;

  @ApiProperty()
  @CreateDateColumn()
  created_at: Date;

  @ApiProperty({ type: () => Order })
  @ManyToOne(() => Order, (order) => order.receipts)
  @JoinColumn({ name: "order_id" })
  order: Order;
}
