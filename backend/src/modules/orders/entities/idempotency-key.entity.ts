import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

@Entity("idempotency_keys")
@Index(["key", "user_id"], { unique: true })
export class IdempotencyKey {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 255 })
  key: string;

  @Column({ type: "uuid" })
  user_id: string;

  @Column({ type: "uuid", nullable: true })
  order_id: string;

  @Column({ type: "jsonb", nullable: true })
  response: Record<string, any>;

  @Column({ type: "integer", default: 200 })
  status_code: number;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: "timestamp" })
  expires_at: Date;
}
