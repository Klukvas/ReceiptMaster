import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";

@Entity("receipt_generation_outbox")
@Index(["receipt_id", "generation_id"], { unique: true })
export class ReceiptGenerationOutbox {
  @PrimaryColumn("uuid") id: string;
  @Column("uuid") receipt_id: string;
  @Column("uuid") order_id: string;
  @Column("uuid") user_id: string;
  @Column("uuid") generation_id: string;
  @Column({ type: "timestamptz", nullable: true }) published_at: Date | null;
  @CreateDateColumn({ type: "timestamptz" }) created_at: Date;
}
