import { Receipt } from "../entities/receipt.entity";
/** Explicit wire allowlist; select:false also protects receipts nested under orders. */
export function receiptProjection(receipt: Receipt) {
  return {
    id: receipt.id,
    order_id: receipt.order_id,
    document_type: receipt.document_type,
    number: receipt.number,
    pdf_url: receipt.pdf_url,
    hash: receipt.hash,
    status: receipt.status,
    template_id: receipt.template_id,
    template_version: receipt.template_version,
    progress: receipt.progress,
    error_message: receipt.error_message,
    created_at: receipt.created_at,
    voided_at: receipt.voided_at,
    void_reason: receipt.void_reason,
    public_token: receipt.public_token,
    active_revision: receipt.active_revision,
    replacement_status: receipt.replacement_status,
    replacement_error: receipt.replacement_error,
  };
}

/**
 * The projection returned by the calls that issue a document: the same keys plus
 * `warnings`, present only when there is something to warn about.
 */
export function issuedDocument(receipt: Receipt) {
  return {
    ...receiptProjection(receipt),
    ...(receipt.warnings?.length ? { warnings: receipt.warnings } : {}),
  };
}

/**
 * A projection plus the order it belongs to, for the documents page. Pure addition:
 * every `receiptProjection` key keeps its name and meaning. The recipient name is the
 * live one, not the name frozen into the document.
 */
export function documentListItem(receipt: Receipt) {
  const { order } = receipt;
  return {
    ...receiptProjection(receipt),
    order: order
      ? {
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          recipient_name: order.recipient?.name ?? null,
        }
      : null,
  };
}
