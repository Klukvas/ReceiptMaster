/**
 * Heading of a waybill whose account never set its own title. Only this default changed
 * (it used to be "Інвойс" / "Инвойс" / "Invoice"); a saved custom title is printed as is,
 * and an issued waybill keeps the heading frozen into its HTML.
 */
export const DEFAULT_RECEIPT_TITLE: Record<string, string> = {
  en: "Delivery note",
  uk: "Видаткова накладна",
  ru: "Расходная накладная",
};

export const DEFAULT_PRIMARY_COLOR = "#3B82F6";

const SPECIAL_TITLES: Record<string, Record<string, string>> = {
  // The price-less style is a shipping note, not a видаткова накладна (which carries prices).
  delivery: {
    en: "Shipping note",
    ru: "Отгрузочная накладная",
    uk: "Накладна на відвантаження",
  },
  proforma: {
    en: "Proforma Invoice",
    ru: "Проформа-инвойс",
    uk: "Проформа-інвойс",
  },
};

export function resolveReceiptTitle(
  title?: string | null,
  templateId = "standard",
  language = "en",
): string {
  if (title?.trim()) return title;
  return (
    SPECIAL_TITLES[templateId]?.[language] ||
    SPECIAL_TITLES[templateId]?.en ||
    DEFAULT_RECEIPT_TITLE[language] ||
    DEFAULT_RECEIPT_TITLE.en
  );
}
