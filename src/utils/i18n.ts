import type { AstroGlobal } from "astro";
import esTranslations from "../i18n/locales/es/translation.json";
import enTranslations from "../i18n/locales/en/translation.json";

type Translations = typeof esTranslations;
type Language = "es" | "en";

const translations: Record<Language, Translations> = {
  es: esTranslations,
  en: enTranslations,
};

export function getLanguageFromAstro(astro: AstroGlobal): Language {
  const langParam = astro.url.searchParams.get("lang");
  if (langParam === "en" || langParam === "es") {
    return langParam;
  }
  return "es";
}

export function t(key: string, lang: Language): string {
  const keys = key.split(".");
  let value: unknown = translations[lang];

  for (const k of keys) {
    if (value && typeof value === "object" && k in value) {
      value = (value as Record<string, unknown>)[k];
    } else {
      return key;
    }
  }

  return typeof value === "string" ? value : key;
}
