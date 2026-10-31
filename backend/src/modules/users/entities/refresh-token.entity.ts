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

  /**
   * Plaintext of rows issued before hashing (or by a rolled-back image); new
   * rows leave it NULL. Read only as a fallback until those rows expire.
   */
  @Index()
  @Column({ type: "varchar", length: 500, nullable: true })
  token: string | null;

  /** SHA-256 (hex) of the token the client holds. */
  @Index("UQ_refresh_tokens_token_hash", { unique: true })
  @Column({ type: "varchar", length: 64, nullable: true })
  token_hash: string | null;

  /** Shared by one login's rotation chain; NULL only on rows of a rolled-back image. */
  @Index("IDX_refresh_tokens_family_live", { where: `"revoked" = false` })
  @Column({ type: "uuid", nullable: true })
  family_id: string | null;

  @Index()
  @Column({ type: "uuid" })
  user_id: string;

  @Column({ type: "timestamp" })
  expires_at: Date;

  @Column({ type: "boolean", default: false })
  revoked: boolean;

  /**
   * Set only when a rotation redeemed it — not by logout, a password change or
   * a family revocation. timestamptz: the replay grace compares it with the
   * process clock.
   */
  @Column({ type: "timestamptz", nullable: true })
  redeemed_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;
}
