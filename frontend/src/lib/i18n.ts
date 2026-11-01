import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// Import translations
import enTranslations from "../locales/en/translation.json";
import ruTranslations from "../locales/ru/translation.json";
import ukTranslations from "../locales/uk/translation.json";

const resources = {
  en: {
    translation: enTranslations,
  },
  ru: {
    translation: ruTranslations,
  },
  uk: {
    translation: ukTranslations,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    debug: process.env.NODE_ENV === "development",

    interpolation: {
      escapeValue: false, // React already does escaping
    },

    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
    },
  });

const syncHtmlLang = (language: string) => {
  document.documentElement.lang = language.split("-")[0];
};

// Resources are bundled, so init() completes synchronously and its "initialized"
// event fires before any listener could be attached: set the language directly.
syncHtmlLang(i18n.language);
i18n.on("languageChanged", syncHtmlLang);

export default i18n;
