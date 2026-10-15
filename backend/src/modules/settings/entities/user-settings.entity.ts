import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

import type { DocumentConfig } from "../document-config";

@Entity("user_settings")
export class UserSettings {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  userId: string;

  @Column({ default: "standard" })
  templateId: string;

  @Column({ nullable: true })
  companyName: string;

  @Column({ nullable: true })
  companyAddress: string;

  @Column({ nullable: true })
  companyEmail: string;

  @Column({ nullable: true })
  companyPhone: string;

  @Column({ nullable: true })
  companyTaxId: string;

  @Column({ nullable: true })
  companyIban: string;

  @Column({ nullable: true })
  companySwift: string;

  @Column({ nullable: true })
  companyWebsite: string;

  @Column({ nullable: true })
  companyTagline: string;

  @Column({ nullable: true })
  receiptTitle: string | null;

  @Column({ default: "en" })
  templateLanguage: string;

  @Column({ nullable: true })
  footerText: string;

  @Column({ nullable: true })
  subFooterText: string;

  @Column({ nullable: true })
  headerText: string;

  @Column({ type: "varchar", length: 7, nullable: true })
  primaryColor: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  paymentTerms: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  deliveryTerms: string;

  @Column({ default: false })
  onboardingCompleted: boolean;

  @Column({ type: "jsonb", nullable: true })
  document_config: DocumentConfig | null;

  @Column({ type: "integer", default: 0 })
  document_config_revision: number;

  @Column({ type: "uuid", nullable: true })
  logo_asset_id: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
