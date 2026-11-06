/**
 * Partials printed by the styles that can carry a typed document (see
 * `allowedStyles` in document-types.ts). They read only the pre-formatted `document`
 * view, never the document type, and use `doc-*` classes so they cannot collide with a
 * style's own `.totals-section` / `.signature-section`. A waybill passes no `document`,
 * so none of this reaches its HTML. Styles for blocks only some types print sit behind
 * `{{#if}}` so the HTML of the other types stays byte-identical. Block tags sit on their own lines so Handlebars
 * drops them from the output.
 *
 * `.doc-tail` wraps everything from the totals to the footer. Chromium does not keep the
 * footer with the closing block through `break-after: avoid` alone, so without the
 * wrapper the footer can print by itself on a last page.
 */

const documentStyles = `
  .doc-parties { display: flex; gap: 24px; margin: 16px 0; font-size: 12px; line-height: 1.5; }
  .doc-party { flex: 1 1 50%; }
  .doc-role { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; margin-bottom: 2px; }
  .doc-name { font-weight: 700; font-size: 13px; }
  .doc-payment { margin: 12px 0 16px; padding: 8px 10px; border: 1px solid #9ca3af; font-size: 12px; line-height: 1.5; }
  .doc-payment-title { font-weight: 700; margin-bottom: 4px; }
  .doc-label { color: #4b5563; }
  .doc-totals { width: 55%; margin: 12px 0 8px auto; font-size: 12px; line-height: 1.6; }
  .doc-total-row { display: flex; justify-content: space-between; gap: 8px; }
  .doc-grand { font-weight: 700; font-size: 14px; border-top: 1px solid #111827; margin-top: 4px; padding-top: 4px; }
  .doc-words { margin: 8px 0 14px; font-size: 12px; break-after: avoid; page-break-after: avoid; break-inside: avoid; page-break-inside: avoid; }
  .doc-closing { margin: 14px 0; font-size: 12px; line-height: 1.5; }
  .doc-signatures { display: flex; gap: 32px; margin-top: 28px; }
  .doc-signature { flex: 1 1 50%; }
  .doc-sign-heading { font-weight: 700; }
  .doc-sign-line { border-bottom: 1px solid #111827; height: 30px; }
  .doc-sign-caption { font-size: 10px; color: #6b7280; margin-top: 2px; }
  .doc-sign-name { margin-top: 4px; }
  .doc-parties, .doc-payment, .doc-totals, .doc-closing, .doc-signatures {
    break-inside: avoid; page-break-inside: avoid;
  }
  .doc-totals { break-after: avoid; page-break-after: avoid; }
  .doc-closing { break-before: avoid; page-break-before: avoid; }
  .doc-tail { break-inside: avoid; page-break-inside: avoid; }
  {{#if document.notice}}
  .doc-notice { margin: 12px 0 0; padding: 6px 10px; border: 1px solid #111827; font-size: 12px; font-weight: 700; text-align: center; break-inside: avoid; page-break-inside: avoid; }
  {{/if}}
  {{#if document.quantities}}
  .doc-quantities { width: 55%; margin: 12px 0 8px auto; font-size: 12px; line-height: 1.6; break-inside: avoid; page-break-inside: avoid; }
  {{/if}}
`;

const documentParties = `{{#if document.notice}}
<div class="doc-notice">{{document.notice}}</div>
{{/if}}
<div class="doc-parties">
  <div class="doc-party">
    <div class="doc-role">{{document.seller.role}}</div>
    <div class="doc-name">{{document.seller.name}}</div>
    {{#if document.seller.code}}
    <div>{{document.seller.codeLabel}} {{document.seller.code}}</div>
    {{/if}}
    {{#if document.seller.address}}
    <div>{{document.seller.address}}</div>
    {{/if}}
    {{#if document.seller.vatLine}}
    <div>{{document.seller.vatLine}}</div>
    {{/if}}
  </div>
  <div class="doc-party">
    <div class="doc-role">{{document.buyer.role}}</div>
    <div class="doc-name">{{document.buyer.name}}</div>
    {{#if document.buyer.code}}
    <div>{{document.buyer.codeLabel}} {{document.buyer.code}}</div>
    {{/if}}
    {{#if document.buyer.address}}
    <div>{{document.buyer.address}}</div>
    {{/if}}
  </div>
</div>
`;

const documentPayment = `{{#if document.payment}}
<div class="doc-payment">
  <div class="doc-payment-title">{{document.labels.paymentDetails}}</div>
  <div><span class="doc-label">{{document.labels.paymentRecipient}}:</span> {{document.payment.recipient}}</div>
  <div><span class="doc-label">{{document.labels.iban}}:</span> {{document.payment.iban}}</div>
  {{#if document.payment.bank}}
  <div><span class="doc-label">{{document.labels.bank}}:</span> {{document.payment.bank}}</div>
  {{/if}}
  <div><span class="doc-label">{{document.labels.purpose}}:</span> {{document.payment.purpose}}</div>
</div>
{{/if}}
`;

const documentTotals = `{{#if document.totals}}
<div class="doc-totals">
  <div class="doc-total-row"><span>{{document.labels.total}}</span><span>{{document.totals.total}}</span></div>
  {{#if document.totals.vat}}
  <div class="doc-total-row"><span>{{document.totals.vat.label}}</span><span>{{document.totals.vat.amount}}</span></div>
  {{/if}}
  {{#if document.totals.noVat}}
  <div class="doc-total-row"><span>{{document.totals.noVat}}</span></div>
  {{/if}}
  <div class="doc-total-row doc-grand"><span>{{document.labels.grandTotal}}</span><span>{{document.totals.grandTotal}}</span></div>
</div>
<div class="doc-words"><span class="doc-label">{{document.labels.amountInWords}}:</span> {{document.totals.amountInWords}}</div>
{{/if}}
{{#if document.quantities}}
<div class="doc-quantities">
  <div class="doc-total-row"><span>{{document.labels.linesCount}}</span><span>{{document.quantities.lines}}</span></div>
  <div class="doc-total-row doc-grand"><span>{{document.labels.totalQuantity}}</span><span>{{document.quantities.units}}</span></div>
</div>
{{/if}}
`;

const documentClosing = `<div class="doc-closing">
  {{#if document.dueDate}}
  <div><strong>{{document.labels.dueDate}}:</strong> {{document.dueDate}}</div>
  {{/if}}
  {{#if document.offer}}
  <div><strong>{{document.labels.validUntil}}:</strong> {{document.offer.validUntil}}</div>
  {{#if document.offer.paymentTerms}}
  <div><span class="doc-label">{{document.labels.paymentTerms}}:</span> {{document.offer.paymentTerms}}</div>
  {{/if}}
  {{#if document.offer.deliveryTerms}}
  <div><span class="doc-label">{{document.labels.deliveryTerms}}:</span> {{document.offer.deliveryTerms}}</div>
  {{/if}}
  {{/if}}
  {{#if document.act}}
  <div>{{document.act.statement}}</div>
  {{#if document.act.contractRef}}
  <div><span class="doc-label">{{document.labels.contract}}:</span> {{document.act.contractRef}}</div>
  {{/if}}
  {{#if document.act.period}}
  <div><span class="doc-label">{{document.labels.period}}:</span> {{document.act.period}}</div>
  {{/if}}
  {{/if}}
  <div class="doc-signatures">
    <div class="doc-signature">
      <div class="doc-sign-heading">{{document.signatures.seller.heading}}</div>
      {{#if document.signatures.seller.position}}
      <div>{{document.signatures.seller.position}}</div>
      {{/if}}
      <div class="doc-sign-line"></div>
      <div class="doc-sign-caption">{{document.signatures.caption}}</div>
      {{#if document.signatures.seller.name}}
      <div class="doc-sign-name">{{document.signatures.seller.name}}</div>
      {{/if}}
    </div>
    {{#if document.signatures.buyer}}
    <div class="doc-signature">
      <div class="doc-sign-heading">{{document.signatures.buyer.heading}}</div>
      <div>&nbsp;</div>
      <div class="doc-sign-line"></div>
      <div class="doc-sign-caption">{{document.signatures.caption}}</div>
      {{#if document.signatures.buyer.name}}
      <div class="doc-sign-name">{{document.signatures.buyer.name}}</div>
      {{/if}}
    </div>
    {{/if}}
  </div>
</div>
`;

/** The five slots every allowed style must contain exactly once. */
export const DOCUMENT_PARTIALS: Readonly<Record<string, string>> = {
  documentStyles,
  documentParties,
  documentPayment,
  documentTotals,
  documentClosing,
};
