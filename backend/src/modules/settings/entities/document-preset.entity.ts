import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";
import type { DocumentConfig } from "../document-config";
@Entity("document_presets")
@Index(["user_id", "name"], { unique: true })
export class DocumentPreset {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ type: "uuid" }) user_id: string;
  @Column({ length: 80 }) name: string;
  @Column({ type: "jsonb", select: false }) config: DocumentConfig;
  @Column({ type: "integer", default: 1 }) revision: number;
  @Column({ type: "uuid", nullable: true }) logo_asset_id: string | null;
  @CreateDateColumn() created_at: Date;
  @UpdateDateColumn() updated_at: Date;
}
