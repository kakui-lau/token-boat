import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import zh from "./locales/zh.json";

const i18nReady = i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh },
    },
    supportedLngs: ["en", "zh"],
    fallbackLng: "zh",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage"],
      caches: ["localStorage"],
      lookupLocalStorage: "console_language_v1",
    },
  });

const syncDocumentLanguage = (language: string) => {
  document.documentElement.lang = language;
};

i18n.on("languageChanged", syncDocumentLanguage);
void i18nReady.then(() => syncDocumentLanguage(i18n.resolvedLanguage ?? "zh"));

export { i18n, i18nReady };
