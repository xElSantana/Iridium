import { useState, useEffect } from "react";

declare global {
  interface Window {
    getTranslation?: (key: string, lang: string) => string;
    getCurrentLanguage?: () => string;
    updatePageLanguage?: (lang: string) => void;
  }
}

export function useClientTranslations() {
  // Leer el idioma SINCRÓNICAMENTE en el primer render
  const [language, setLanguage] = useState<string>(() => {
    if (typeof window === "undefined") return "es";

    // Leer directamente del localStorage para evitar el flash
    const stored = localStorage.getItem("iridium-language");
    return stored === "en" || stored === "es" ? stored : "es";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Verificar si el idioma cambió desde el render inicial
    const current = window.getCurrentLanguage?.() || "es";
    if (current !== language) {
      setLanguage(current);
    }

    const handleLanguageChange = (event: CustomEvent<{ language: string }>) => {
      setLanguage(event.detail.language);
    };

    window.addEventListener("languagechange", handleLanguageChange as EventListener);

    return () => {
      window.removeEventListener("languagechange", handleLanguageChange as EventListener);
    };
  }, [language]);

  const t = (key: string): string => {
    if (typeof window === "undefined") return key;
    return window.getTranslation?.(key, language) || key;
  };

  return { t, language };
}
