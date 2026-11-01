import type { DocumentConfig } from "../../lib/document-config";
import {
  documentLocales,
  documentMoney,
  documentDate,
} from "../../lib/document-config";
import { useTranslation } from "../../hooks/useTranslation";
import { Input } from "../ui/Input";
/** "ru" -> "Russian", "en-GB" -> "English (United Kingdom)", in the interface language. */
const readableLanguage = (code: string, interfaceLanguage: string): string => {
  try {
    return new Intl.DisplayNames([interfaceLanguage], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
};
export const selectClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-elevated px-3 py-2 text-sm text-content focus:ring-2 focus:ring-[var(--color-ring)]";
export function DocumentFormatting({
  config,
  onChange,
}: {
  config: DocumentConfig;
  onChange: (value: DocumentConfig) => void;
}) {
  const { t, currentLanguage, changeLanguage } = useTranslation();
  const f = config.formatting;
  const patch = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) =>
    onChange({ ...config, formatting: { ...f, [key]: value } });
  const options = <K extends keyof typeof f>(
    key: K,
    values: readonly string[],
  ) => (
    <label className="block text-sm text-content-secondary">
      {t(`document.${key}`)}
      <select
        aria-label={t(`document.${key}`)}
        className={selectClass}
        value={f[key]}
        onChange={(event) => patch(key, event.target.value as (typeof f)[K])}
      >
        {values.map((value) => (
          <option key={value} value={value}>
            {t(`document.option_${value}`, readableLanguage(value, currentLanguage))}
          </option>
        ))}
      </select>
    </label>
  );
  let example = t("document.invalidFormatting");
  try {
    example = `${documentMoney(123456, "UAH", f)} · ${documentDate("2026-10-25T01:30:00Z", config.documentLanguage, f)}`;
  } catch {
    /* The server validates invalid time zones on Save. */
  }
  return (
    <div className="space-y-5">
      <label className="block text-sm text-content-secondary">
        {t("document.interfaceLanguage")}
        <select
          aria-label={t("document.interfaceLanguage")}
          className={selectClass}
          value={currentLanguage}
          onChange={(event) =>
            changeLanguage(event.target.value as "en" | "ru" | "uk")
          }
        >
          {["en", "ru", "uk"].map((value) => (
            <option key={value} value={value}>
              {readableLanguage(value, currentLanguage)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm text-content-secondary">
        {t("document.documentLanguage")}
        <select
          aria-label={t("document.documentLanguage")}
          className={selectClass}
          value={config.documentLanguage}
          onChange={(event) =>
            onChange({
              ...config,
              documentLanguage: event.target
                .value as DocumentConfig["documentLanguage"],
            })
          }
        >
          {["en", "ru", "uk"].map((value) => (
            <option key={value} value={value}>
              {readableLanguage(value, currentLanguage)}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-content-tertiary">
        {t("document.formattingHelp")}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {options("numberLocale", documentLocales)}
        {options("currencyDisplay", ["symbol", "narrowSymbol", "code"])}
        {options("dateLocale", ["document", ...documentLocales])}
        {options("dateStyle", ["numeric", "short", "medium", "long"])}
        {options("timeStyle", ["none", "short", "medium"])}
        {options("hourCycle", ["h12", "h23"])}
        <Input
          label={t("document.timeZone")}
          value={f.timeZone}
          maxLength={100}
          onChange={(event) => patch("timeZone", event.target.value)}
        />
      </div>
      <p
        role="status"
        className="rounded-lg bg-surface-alt p-3 text-sm text-content"
      >
        {example}
      </p>
    </div>
  );
}
