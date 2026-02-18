import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

@Entity("audit_logs")
export class AuditLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid", nullable: true })
  user_id?: string;

  @Column({ type: "varchar", length: 50 })
  action: string;

  @Column({ type: "varchar", length: 50 })
  entity_type: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  entity_id?: string;

  @Column({ type: "jsonb", nullable: true })
  old_values?: Record<string, any>;

  @Column({ type: "jsonb", nullable: true })
  new_values?: Record<string, any>;

  @Column({ type: "varchar", length: 45, nullable: true })
  ip_address?: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  user_agent?: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  request_id?: string;

  @Index()
  @CreateDateColumn()
  created_at: Date;
}
