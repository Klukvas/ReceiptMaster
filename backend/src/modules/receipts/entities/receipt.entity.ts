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

export enum ReceiptStatus {
  GENERATED = "generated",
  VOID = "void",
}

@Entity("receipts")
@Index(["order_id"], { unique: true })
@Index(["number"], { unique: true })
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

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Order, (order) => order.receipts)
  @JoinColumn({ name: "order_id" })
  order: Order;
}
