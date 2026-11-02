import { Column, Entity, PrimaryColumn } from "typeorm";
import { DocumentType } from "./receipt.entity";

/**
 * Last number handed out per account and document type; bumped by `nextDocumentNumber`
 * with raw SQL. The entity exists so schemas built from entities get the table too.
 */
@Entity("document_counters")
export class DocumentCounter {
  @PrimaryColumn({ type: "uuid" })
  user_id: string;

  @PrimaryColumn({
    type: "enum",
    enum: DocumentType,
    enumName: "receipts_document_type_enum",
  })
  document_type: DocumentType;

  @Column({ type: "integer", default: 0 })
  value: number;
}
