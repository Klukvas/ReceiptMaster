import { Receipt } from "../entities/receipt.entity";
/** Explicit wire allowlist; select:false also protects receipts nested under orders. */
export function receiptProjection(receipt: Receipt) {
  return {
    id: receipt.id,
    order_id: receipt.order_id,
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
