/** Shared constraints for user-supplied text and artwork in every printable style. */
export const PRINT_LAYOUT_CSS = `
  .container * { min-width: 0; overflow-wrap: anywhere; }
  .items-table { table-layout: fixed; }
  .items-table th, .items-table td { white-space: normal; overflow-wrap: anywhere; }
  .items-table .col-description, .items-table .col-item { width: 46%; }
  .items-table .col-qty { width: 12%; }
  .items-table .col-price, .items-table .col-unit-price { width: 21%; }
  .items-table .col-total, .items-table .col-amount { width: 21%; }
  img.logo, img[alt="Logo"] {
    width: auto; height: auto; max-width: 200px; max-height: 120px;
    object-fit: contain; flex-shrink: 1;
  }
  .header { gap: 12px; }
  .header-left { max-width: 60%; }
  .header-left > div { flex: 1; }
  .info-row, .meta-item, .invoice-row, .subtotal-row, .total-row { gap: 8px; }
  .client-info { flex: 1 1 65%; }
  .invoice-info { flex: 1 1 35%; }
  .tax-info, .total-info { flex: 1 1 50%; }
  .document-header { height: auto; min-height: 32px; }
  .totals-table, .totals-card { max-width: 100%; }
  .items-table tr, .item-row { break-inside: avoid; page-break-inside: avoid; }
  .totals-section, .tax-total-section, .signature-section, .footer, .footer-section {
    break-inside: avoid; page-break-inside: avoid;
  }
  .totals-section, .tax-total-section { break-after: avoid; page-break-after: avoid; }
  .footer, .footer-section { margin-top: 16px; }
  .footer:not(:has(*)) { display: none; }
`;
