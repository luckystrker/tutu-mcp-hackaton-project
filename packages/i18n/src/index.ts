export const SUPPORTED_LOCALES = ["en", "ru"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en";

export function normalizeLocale(value: unknown): SupportedLocale | null {
  if (typeof value !== "string") return null;
  const language = value.trim().toLowerCase().split(/[-_]/, 1)[0];
  if (language === "ru") return "ru";
  if (language === "en") return "en";
  return null;
}

export function resolveLocale(candidates: readonly unknown[]): SupportedLocale {
  for (const candidate of candidates) {
    const locale = normalizeLocale(candidate);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

export function localeTag(locale: SupportedLocale): string {
  return locale === "ru" ? "ru-RU" : "en-US";
}
