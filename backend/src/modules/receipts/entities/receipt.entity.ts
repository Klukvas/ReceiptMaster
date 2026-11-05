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

/**
 * `waybill` (видаткова накладна), `invoice` (рахунок на оплату), `act` (акт виконаних
 * робіт), `sales_receipt` (товарний чек, non-fiscal) and `packing_list` (пакувальний лист,
 * no prices) are generated today; the rest are reserved.
 */
export enum DocumentType {
  WAYBILL = "waybill",
  INVOICE = "invoice",
  QUOTE = "quote",
  ACT = "act",
  SALES_RECEIPT = "sales_receipt",
  PACKING_LIST = "packing_list",
  RETURN_NOTE = "return_note",
}

@Entity("receipts")
// A return note is the one type an order may carry several of (partial returns). A voided
// invoice or act is history and frees its slot for a reissue; any other voided type keeps it.
@Index("IDX_receipts_order_document_type", ["order_id", "document_type"], {
  unique: true,
  where: `"document_type" <> 'return_note' AND ("status" <> 'void' OR "document_type" NOT IN ('invoice', 'act'))`,
})
@Index(
  "IDX_receipts_user_type_number",
  ["user_id", "document_type", "number"],
  {
    unique: true,
  },
)
@Index("IDX_receipts_order_id", ["order_id"])
@Index(["user_id", "created_at"])
export class Receipt {
  @ApiProperty()
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ApiProperty()
  @Column({ type: "uuid" })
  order_id: string;

  @ApiProperty({ enum: DocumentType })
  @Column({
    type: "enum",
    enum: DocumentType,
    enumName: "receipts_document_type_enum",
    default: DocumentType.WAYBILL,
  })
  document_type: DocumentType;

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
