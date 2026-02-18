import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./user.entity";

@Entity("refresh_tokens")
export class RefreshToken {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "varchar", length: 500 })
  token: string;

  @Index()
  @Column({ type: "uuid" })
  user_id: string;

  @Column({ type: "timestamp" })
  expires_at: Date;

  @Column({ type: "boolean", default: false })
  revoked: boolean;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;
}
