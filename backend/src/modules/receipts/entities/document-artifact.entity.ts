import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("document_artifacts")
@Index(["user_id", "lease_expires_at"])
export class DocumentArtifact {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ type: "uuid" }) user_id: string;
  @Column({ unique: true }) object_key: string;
  @Column() state: "uploading" | "ready" | "deleting";
  @Column({ type: "timestamptz" }) lease_expires_at: Date;
  @Column({ default: false }) upload_pending: boolean;
  @Column({ type: "uuid", default: () => "gen_random_uuid()" })
  cleanup_token: string;
  @Column({ type: "integer", default: 0 }) cleanup_attempts: number;
}
