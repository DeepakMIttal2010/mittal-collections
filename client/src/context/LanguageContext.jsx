import { createContext, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { initialLanguage, isBilingualPath, urlLanguage } from "../utils/languageFromPath";

const LanguageContext = createContext();

// localStorage can throw (blocked storage, some private modes); the site
// must still work, just without remembering the choice.
const readSavedLanguage = () => {
  try {
    return localStorage.getItem("language");
  } catch {
    return null;
  }
};

const saveLanguage = (lang) => {
  try {
    localStorage.setItem("language", lang);
  } catch {
    // ignore: preference simply isn't remembered
  }
};

export function LanguageProvider({ children }) {
  const { pathname } = useLocation();
  const [language, setLanguage] = useState(() => initialLanguage(pathname, readSavedLanguage()));

  // Client-side navigation onto a bilingual page in the other language (a
  // link, Back/Forward, a redirect) must switch in the same render too,
  // not after the page's data loads -- otherwise the delivery banner
  // changes height late and shifts the page, exactly like a first load did.
  // Only reacts to a PATH change, never to a language change, so the
  // header toggle (language first, then the page navigates) is unchanged.
  const [syncedPath, setSyncedPath] = useState(pathname);
  if (pathname !== syncedPath) {
    setSyncedPath(pathname);
    if (isBilingualPath(pathname) && urlLanguage(pathname) !== language) {
      setLanguage(urlLanguage(pathname));
    }
  }

  // Remember the language a bilingual URL put us in, as the pages' own
  // sync effects used to when they flipped the toggle.
  useEffect(() => {
    if (isBilingualPath(pathname) && readSavedLanguage() !== language) {
      saveLanguage(language);
    }
  }, [pathname, language]);

  const changeLanguage = (lang) => {
    setLanguage(lang);
    saveLanguage(lang);
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
