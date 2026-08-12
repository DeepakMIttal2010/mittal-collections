import { createContext, useContext, useState } from "react";

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem("language") === "hi" ? "hi" : "en";
  });

  const changeLanguage = (lang) => {
    setLanguage(lang);
    localStorage.setItem("language", lang);
  };

  // Usage: t("English text", "हिंदी टेक्स्ट"). Falls back to the
  // English string when no Hindi text is supplied (e.g. dynamic
  // product data that hasn't been translated yet).
  const t = (en, hi) => (language === "hi" && hi ? hi : en);

  return (
    <LanguageContext.Provider value={{ language, setLanguage: changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
