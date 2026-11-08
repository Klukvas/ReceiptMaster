/**
 * `Content-Disposition` for an inline PDF whose name may hold non-Latin characters (a
 * Cyrillic number prefix such as "РФ-2026-000043"). Node refuses header values outside
 * Latin-1, so the plain `filename` is an ASCII fallback and `filename*` (RFC 5987) carries
 * the exact name for browsers that understand it.
 */
export function pdfDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\%]/g, "_");
  // encodeURIComponent keeps ' ( ) * which are not allowed in an RFC 5987 value.
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
