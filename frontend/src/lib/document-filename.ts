/**
 * The file name a downloaded document PDF is saved under. Mirrors the API's
 * `documentFilename` (backend `receipts.service.ts`): the waybill keeps its
 * historical `receipt-<number>` name, every other type is `<type>-<number>`,
 * so two types that share a number never collide on disk.
 */
export function documentPdfFilename(
  documentType: string | null | undefined,
  number: string,
): string {
  // Rows from before document types existed are waybills.
  const type = documentType || "waybill";
  return type === "waybill" ? `receipt-${number}.pdf` : `${type}-${number}.pdf`;
}

/**
 * The file name the server put in a `Content-Disposition` header, or null when
 * the header is absent or unreadable (cross-origin responses hide it unless it
 * is exposed). Prefers the RFC 5987 `filename*` form.
 */
export function filenameFromDisposition(
  header: string | null | undefined,
): string | null {
  if (!header) return null;
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      // A malformed escape falls through to the plain ASCII form below.
    }
  }
  const plain = /filename\s*=\s*"([^"]+)"/i.exec(header);
  return plain ? plain[1] : null;
}
