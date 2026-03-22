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

// Sync <html lang> on init and on every language change
i18n.on("initialized", () => {
  document.documentElement.lang = i18n.language.split("-")[0];
});
i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng.split("-")[0];
});

export default i18n;
