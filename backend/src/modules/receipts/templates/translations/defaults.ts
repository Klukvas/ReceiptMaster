export const DEFAULT_RECEIPT_TITLE: Record<string, string> = {
  en: "Invoice",
  uk: "Інвойс",
  ru: "Инвойс",
};

export const DEFAULT_PRIMARY_COLOR = "#3B82F6";

const SPECIAL_TITLES: Record<string, Record<string, string>> = {
  delivery: { en: "Delivery Note", ru: "Накладная", uk: "Видаткова накладна" },
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
