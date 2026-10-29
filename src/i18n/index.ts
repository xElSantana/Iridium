import i18next from "i18next";
import es from "./locales/es/translation.json";
import en from "./locales/en/translation.json";

const i18n = i18next.createInstance();
const initialized = i18n.init({
  lng: "es",
  fallbackLng: "es",
  supportedLngs: ["es", "en"],
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  interpolation: { escapeValue: false },
});

export function resolveLanguage(cookieValue?: string | null, url?: URL) {
  const requestedLanguage = url?.searchParams.get("lang");
  if (requestedLanguage === "es" || requestedLanguage === "en") {
    return requestedLanguage;
  }

  if (cookieValue === "es" || cookieValue === "en") {
    return cookieValue;
  }

  return "es";
}

export async function getTranslations(language: string = "es") {
  await initialized;
  return i18n.getFixedT(language);
}
