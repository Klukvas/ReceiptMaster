import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

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

  @Column({ default: "Invoice" })
  receiptTitle: string;

  @Column({ default: "en" })
  templateLanguage: string;

  @Column({ nullable: true })
  footerText: string;

  @Column({ nullable: true })
  subFooterText: string;

  @Column({ nullable: true })
  headerText: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
