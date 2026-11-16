import { useState, useEffect } from "react";

declare global {
  interface Window {
    getTranslation?: (key: string, lang: string) => string;
    getCurrentLanguage?: () => string;
    updatePageLanguage?: (lang: string) => void;
  }
}

export function useClientTranslations() {
  const [language, setLanguage] = useState<string>(() => {
    if (typeof window === "undefined") return "es";

    const stored = localStorage.getItem("iridium-language");
    return stored === "en" || stored === "es" ? stored : "es";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

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
