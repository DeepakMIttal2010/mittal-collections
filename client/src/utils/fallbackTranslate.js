// A t(en, hi) for UI that can render outside LanguageProvider -- the
// top-level ErrorBoundary in main.jsx wraps every provider, so its
// fallback has no language context. Picks the language from the URL with
// the same rule as isHindiPath (/hi and /hi/... are Hindi); not imported
// from hindiPath.js because that module pulls in React context/router.
export const fallbackTranslate = (pathname = "") => {
  const isHindi = pathname === "/hi" || pathname.startsWith("/hi/");
  return (en, hi) => (isHindi && hi ? hi : en);
};
