import i18next from "i18next";
import es from "./locales/es/translation.json";

const i18n = i18next.createInstance();
const initialized = i18n.init({
  lng: "es",
  fallbackLng: "es",
  supportedLngs: ["es"],
  resources: {
    es: { translation: es },
  },
  interpolation: { escapeValue: false },
});

export async function getTranslations() {
  await initialized;
  return i18n.getFixedT("es");
}
