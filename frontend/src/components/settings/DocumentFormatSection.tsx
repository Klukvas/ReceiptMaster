import {
  documentDate,
  documentLocales,
  documentMoney,
  type DocumentConfig,
  type DocumentLocale,
} from "../../lib/document-config";
import {
  followDocumentLanguage,
  LANGUAGE_LOCALES,
} from "../../lib/document-language-formatting";
import { useTranslation } from "../../hooks/useTranslation";
import { Disclosure } from "../ui/Disclosure";
import { DocumentSection, LabelledField, selectClass } from "./document-ui";

type Formatting = DocumentConfig["formatting"];

/**
 * One region sets how numbers and dates are written, which is what most people want.
 * The individual fields stay available under "fine-tune".
 */
const REGIONS: ReadonlyArray<{
  code: string;
  locale: DocumentLocale;
  hourCycle: Formatting["hourCycle"];
}> = [
  { code: "UA", locale: "uk-UA", hourCycle: "h23" },
  { code: "RU", locale: "ru-RU", hourCycle: "h23" },
  { code: "US", locale: "en-US", hourCycle: "h12" },
  { code: "GB", locale: "en-GB", hourCycle: "h23" },
  { code: "DE", locale: "de-DE", hourCycle: "h23" },
  { code: "FR", locale: "fr-FR", hourCycle: "h23" },
];
const CUSTOM_REGION = "custom";
const LANGUAGES = ["en", "ru", "uk"] as const;
// 25 Oct 2026, 15:30:05 in Kyiv: a date where day, month and hour are all unambiguous.
const SAMPLE_DATE = "2026-10-25T13:30:05Z";
const SAMPLE_CENTS = 123456;

/** "uk" -> "Ukrainian", "en-GB" -> "English (United Kingdom)", in the interface language. */
const displayName = (
  code: string,
  type: "language",
  interfaceLanguage: string,
): string => {
  try {
    return (
      new Intl.DisplayNames([interfaceLanguage], { type }).of(code) ?? code
    );
  } catch {
    return code;
  }
};

/**
 * The region whose conventions the formatting matches in full: numbers, dates ("document"
 * dates are written in the document language's locale) and the hour cycle. A mix, such as
 * Russian numbers with US dates, is "custom", so the region never claims what the example
 * below it contradicts.
 */
const regionOf = (
  formatting: Formatting,
  language: DocumentConfig["documentLanguage"],
): string => {
  const dateLocale =
    formatting.dateLocale === "document"
      ? LANGUAGE_LOCALES[language]
      : formatting.dateLocale;
  return (
    REGIONS.find(
      (region) =>
        region.locale === formatting.numberLocale &&
        region.locale === dateLocale &&
        region.hourCycle === formatting.hourCycle,
    )?.code ?? CUSTOM_REGION
  );
};

const isValidTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const knownTimeZones = (): string[] => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [
      "Europe/Kyiv",
      "Europe/London",
      "Europe/Berlin",
      "America/New_York",
      "UTC",
    ];
  }
};

export function DocumentFormatSection({
  config,
  onChange,
  defaultOpen,
}: {
  config: DocumentConfig;
  onChange: (value: DocumentConfig) => void;
  defaultOpen?: boolean;
}) {
  const { t, currentLanguage } = useTranslation();
  const formatting = config.formatting;
  const language = config.documentLanguage;
  const patch = (changes: Partial<Formatting>) =>
    onChange({ ...config, formatting: { ...formatting, ...changes } });

  // An invalid time zone makes Intl throw; the server also validates on Save.
  const zoneIsValid = isValidTimeZone(formatting.timeZone);
  const show = (changes: Partial<Formatting>): string => {
    try {
      return documentDate(SAMPLE_DATE, language, { ...formatting, ...changes });
    } catch {
      return "";
    }
  };
  const money = (changes: Partial<Formatting>): string => {
    try {
      return documentMoney(SAMPLE_CENTS, "UAH", { ...formatting, ...changes });
    } catch {
      return "";
    }
  };
  const example = zoneIsValid
    ? t("document.formatExample", { money: money({}), date: show({}) })
    : t("document.invalidFormatting");
  const region = regionOf(formatting, language);
  // Regions and number formats are named by how they write a sample, not by a country:
  // what the user picks is a way of writing amounts and dates.
  const regionSample = (value: (typeof REGIONS)[number]): string =>
    [
      money({ numberLocale: value.locale }),
      zoneIsValid
        ? show({ dateLocale: value.locale, hourCycle: value.hourCycle })
        : "",
    ]
      .filter(Boolean)
      .join(" · ") || value.locale;

  return (
    <DocumentSection
      title={t("document.sectionFormats")}
      description={t("document.sectionFormatsHelp")}
      defaultOpen={defaultOpen}
    >
      <fieldset>
        <legend className="mb-1 block text-sm font-medium text-content-secondary">
          {t("document.documentLanguage")}
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {LANGUAGES.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={language === value}
              onClick={() =>
                onChange({
                  ...config,
                  documentLanguage: value,
                  formatting: followDocumentLanguage(formatting, language, value),
                })
              }
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                language === value
                  ? "border-accent-base bg-[var(--color-accent-light)] text-accent-base"
                  : "border-[var(--color-border)] text-content-secondary hover:bg-surface-alt"
              }`}
            >
              {displayName(value, "language", currentLanguage)}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-content-tertiary">
          {t("document.documentLanguageHelp")}
        </p>
      </fieldset>

      <LabelledField
        label={t("document.region")}
        hint={t("document.regionHelp")}
      >
        {(ids) => (
          <select
            {...ids}
            className={selectClass}
            value={region}
            onChange={(event) => {
              const chosen = REGIONS.find(
                (value) => value.code === event.target.value,
              );
              if (chosen)
                patch({
                  numberLocale: chosen.locale,
                  dateLocale: chosen.locale,
                  hourCycle: chosen.hourCycle,
                });
            }}
          >
            {region === CUSTOM_REGION && (
              <option value={CUSTOM_REGION}>
                {t("document.regionCustom")}
              </option>
            )}
            {REGIONS.map((value) => (
              <option key={value.code} value={value.code}>
                {regionSample(value)}
              </option>
            ))}
          </select>
        )}
      </LabelledField>

      <p
        role="status"
        className="rounded-lg bg-surface-alt p-3 text-sm text-content"
      >
        {example}
      </p>

      <Disclosure summary={t("document.fineTuning")}>
        <p className="text-sm text-content-tertiary">
          {t("document.formattingHelp")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <LabelledField label={t("document.numberLocale")}>
            {(ids) => (
              <select
                {...ids}
                className={selectClass}
                value={formatting.numberLocale}
                onChange={(event) =>
                  patch({
                    numberLocale: event.target.value as DocumentLocale,
                  })
                }
              >
                {documentLocales.map((value) => (
                  <option key={value} value={value}>
                    {money({ numberLocale: value }) || value}
                  </option>
                ))}
              </select>
            )}
          </LabelledField>
          <LabelledField label={t("document.currencyDisplay")}>
            {(ids) => (
              <select
                {...ids}
                className={selectClass}
                value={formatting.currencyDisplay}
                onChange={(event) =>
                  patch({
                    currencyDisplay: event.target
                      .value as Formatting["currencyDisplay"],
                  })
                }
              >
                {(["symbol", "narrowSymbol", "code"] as const).map((value) => (
                  <option key={value} value={value}>
                    {money({ currencyDisplay: value })}
                  </option>
                ))}
              </select>
            )}
          </LabelledField>
          <LabelledField label={t("document.dateLocale")}>
            {(ids) => (
              <select
                {...ids}
                className={selectClass}
                value={formatting.dateLocale}
                onChange={(event) =>
                  patch({
                    dateLocale: event.target.value as Formatting["dateLocale"],
                  })
                }
              >
                <option value="document">
                  {t("document.dateLocaleDocument")}
                </option>
                {documentLocales.map((value) => (
                  <option key={value} value={value}>
                    {displayName(value, "language", currentLanguage)}
                  </option>
                ))}
              </select>
            )}
          </LabelledField>
          <LabelledField label={t("document.dateStyle")}>
            {(ids) => (
              <select
                {...ids}
                className={selectClass}
                value={formatting.dateStyle}
                onChange={(event) =>
                  patch({
                    dateStyle: event.target.value as Formatting["dateStyle"],
                  })
                }
              >
                {(["numeric", "short", "medium", "long"] as const).map(
                  (value) => (
                    <option key={value} value={value}>
                      {show({ dateStyle: value, timeStyle: "none" })}
                    </option>
                  ),
                )}
              </select>
            )}
          </LabelledField>
          <LabelledField label={t("document.timeStyle")}>
            {(ids) => (
              <select
                {...ids}
                className={selectClass}
                value={formatting.timeStyle}
                onChange={(event) =>
                  patch({
                    timeStyle: event.target.value as Formatting["timeStyle"],
                  })
                }
              >
                <option value="none">{t("document.timeNone")}</option>
                {(["short", "medium"] as const).map((value) => (
                  <option key={value} value={value}>
                    {show({ dateStyle: "numeric", timeStyle: value })}
                  </option>
                ))}
              </select>
            )}
          </LabelledField>
          <LabelledField label={t("document.hourCycle")}>
            {(ids) => (
              <select
                {...ids}
                className={selectClass}
                value={formatting.hourCycle}
                onChange={(event) =>
                  patch({
                    hourCycle: event.target.value as Formatting["hourCycle"],
                  })
                }
              >
                {(["h12", "h23"] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(`document.option_${value}`)}:{" "}
                    {show({
                      dateStyle: "numeric",
                      timeStyle: "short",
                      hourCycle: value,
                    })}
                  </option>
                ))}
              </select>
            )}
          </LabelledField>
        </div>
        <LabelledField
          label={t("document.timeZone")}
          hint={
            zoneIsValid
              ? t("document.timeZoneHelp")
              : t("document.timeZoneInvalid")
          }
        >
          {(ids) => (
            <>
              <input
                {...ids}
                list="document-time-zones"
                type="text"
                maxLength={100}
                className={selectClass}
                aria-invalid={!zoneIsValid || undefined}
                value={formatting.timeZone}
                onChange={(event) => patch({ timeZone: event.target.value })}
              />
              <datalist id="document-time-zones">
                {knownTimeZones().map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
            </>
          )}
        </LabelledField>
      </Disclosure>
    </DocumentSection>
  );
}
