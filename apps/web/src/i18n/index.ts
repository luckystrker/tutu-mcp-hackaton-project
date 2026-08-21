import {
  DEFAULT_LOCALE,
  resolveLocale,
  type SupportedLocale,
} from "@rendezvous/i18n";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { telegramLanguageCode } from "../telegram/bridge.js";
import { en, ru } from "./resources.js";

export const LOCALE_STORAGE_KEY = "rendezvous.locale.v1";

function readStoredLocale(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage?.getItem(LOCALE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function detectInitialLocale(): SupportedLocale {
  const browserLanguages =
    typeof navigator === "undefined"
      ? []
      : [...(navigator.languages ?? []), navigator.language];
  return resolveLocale([
    readStoredLocale(),
    telegramLanguageCode(),
    ...browserLanguages,
    DEFAULT_LOCALE,
  ]);
}

export async function initializeI18n(): Promise<void> {
  if (i18n.isInitialized) return;
  await i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      ru: { translation: ru },
    },
    lng: detectInitialLocale(),
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: ["en", "ru"],
    load: "languageOnly",
    keySeparator: false,
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  applyDocumentLanguage(currentLocale());
}

export function currentLocale(): SupportedLocale {
  return i18n.resolvedLanguage === "ru" ? "ru" : "en";
}

export async function setLocale(locale: SupportedLocale): Promise<void> {
  try {
    if (typeof window !== "undefined")
      window.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // The choice still applies for this session when storage is unavailable.
  }
  await i18n.changeLanguage(locale);
  applyDocumentLanguage(locale);
}

function applyDocumentLanguage(locale: SupportedLocale): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.title = "Rendezvous";
}

export default i18n;
