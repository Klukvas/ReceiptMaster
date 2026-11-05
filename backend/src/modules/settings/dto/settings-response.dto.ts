import { ApiProperty } from "@nestjs/swagger";

export class TemplateColorsDto {
  @ApiProperty()
  primary: string;

  @ApiProperty()
  secondary: string;

  @ApiProperty()
  accent: string;
}

export class TemplateInfoDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  category: string;

  @ApiProperty({ type: [String] })
  features: string[];

  @ApiProperty({ type: () => TemplateColorsDto })
  colors: TemplateColorsDto;

  @ApiProperty()
  locked: boolean;
}

export class ReceiptDesignResponseDto {
  @ApiProperty()
  receiptTitle: string;

  @ApiProperty()
  hasCustomReceiptTitle: boolean;

  @ApiProperty()
  templateId: string;

  @ApiProperty()
  templateLanguage: string;

  @ApiProperty()
  footerTitle: string;

  @ApiProperty()
  footerSubtitle: string;

  @ApiProperty()
  primaryColor: string;

  @ApiProperty()
  paymentTerms: string;

  @ApiProperty()
  deliveryTerms: string;
}

export class CompanyInfoResponseDto {
  @ApiProperty()
  companyName: string;

  @ApiProperty()
  companyAddress: string;

  @ApiProperty()
  companyEmail: string;

  @ApiProperty()
  companyPhone: string;

  @ApiProperty()
  companyTaxId: string;

  @ApiProperty()
  companyIban: string;

  @ApiProperty()
  companySwift: string;

  @ApiProperty()
  companyWebsite: string;

  @ApiProperty()
  companyTagline: string;

  @ApiProperty({ enum: ["edrpou", "rnokpp"], nullable: true })
  companyTaxIdKind: "edrpou" | "rnokpp" | null;

  @ApiProperty({ type: String, nullable: true })
  companyLegalForm: string | null;

  @ApiProperty({ type: String, nullable: true })
  companyBankName: string | null;

  @ApiProperty({ type: Boolean, nullable: true })
  companyVatPayer: boolean | null;

  @ApiProperty({ type: String, nullable: true })
  companyVatId: string | null;

  @ApiProperty({ type: String, nullable: true })
  companySignatoryName: string | null;

  @ApiProperty({ type: String, nullable: true })
  companySignatoryPosition: string | null;

  @ApiProperty({ type: Number, nullable: true, minimum: 1, maximum: 365 })
  defaultPaymentTermDays: number | null;
}
