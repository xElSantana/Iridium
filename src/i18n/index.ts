import i18next from "i18next";
import es from "./locales/es/translation.json";

export const locales = ["es"] as const;
export type Locale = (typeof locales)[number];

const resources = {
  es: {
    translation: es,
  },
};

export async function createTranslator(locale: Locale = "es") {
  const instance = i18next.createInstance();

  await instance.init({
    lng: locale,
    fallbackLng: "es",
    supportedLngs: [...locales],
    defaultNS: "translation",
    resources,
    interpolation: {
      escapeValue: false,
    },
  });

  return instance.getFixedT(locale);
}
