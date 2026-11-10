import { Column, Entity, PrimaryColumn } from "typeorm";
import { DocumentType } from "./receipt.entity";

/**
 * Last number handed out per account, document type and calendar year, for the types
 * whose numbering restarts every year (`document_counters.reset_every_year`). Rows are
 * created and bumped by `nextDocumentNumber` with raw SQL; the entity exists so schemas
 * built from entities get the table too.
 */
@Entity("document_year_counters")
export class DocumentYearCounter {
  @PrimaryColumn({ type: "uuid" })
  user_id: string;

  @PrimaryColumn({
    type: "enum",
    enum: DocumentType,
    enumName: "receipts_document_type_enum",
  })
  document_type: DocumentType;

  @PrimaryColumn({ type: "integer" })
  year: number;

  @Column({ type: "integer", default: 0 })
  value: number;
}
