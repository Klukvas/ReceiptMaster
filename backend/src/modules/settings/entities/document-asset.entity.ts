import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";
@Entity("document_assets")
@Index(["id", "user_id"], { unique: true })
export class DocumentAsset {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ type: "uuid" }) user_id: string;
  @Column({ unique: true }) object_key: string;
  @Column({ length: 64 }) sha256: string;
  @Column({ default: "image/png" }) mime: string;
  @Column({ type: "integer" }) bytes: number;
  @Column({ type: "integer" }) width: number;
  @Column({ type: "integer" }) height: number;
  @Column({ default: "uploading" }) state: "uploading" | "ready" | "deleting";
  @Column({ type: "timestamptz" }) lease_expires_at: Date;
  @Column({ default: false }) upload_pending: boolean;
  @Column({ type: "uuid", default: () => "gen_random_uuid()" })
  cleanup_token: string;
  @Column({ type: "integer", default: 0 }) cleanup_attempts: number;
  @CreateDateColumn() created_at: Date;
}
