import { useLocation } from "react-router-dom";

import AppRoutes from "./routes/AppRoutes";
import ScrollToTop from "./components/ScrollToTop";
import BackToTopButton from "./components/BackToTopButton";
import ZoomControl from "./components/ZoomControl";
import VisitTracker from "./components/VisitTracker";
import WhatsAppButton from "./components/WhatsAppButton";
import CompareBar from "./components/CompareBar";
import ErrorBoundary from "./components/ErrorBoundary";

// These auth pages are short, vertically-centered forms whose own
// primary CTA (Sign in / Create account / etc.) lands inside the exact
// viewport band BackToTopButton/WhatsAppButton float in on common
// mobile heights -- confirmed live (mobile audit, 2026-09-27) covering
// the button text itself, not just nearby whitespace. Unlike a long
// scrollable page (Cart, Category), there's no "end of content" to add
// trailing space to here -- the collision is with the FIRST view. A
// customer mid-login doesn't need a floating WhatsApp chat prompt
// competing with Sign In anyway, so the simplest correct fix is not
// rendering either button on these routes rather than chasing exact
// spacing across every viewport height a banner could still be showing.
const AUTH_PAGE_PREFIXES = ["/login", "/register", "/forgot-password", "/reset-password"];

function App() {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith("/admin");
  const isAuthPage = AUTH_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  return (
    <>
      <ScrollToTop />
      <ErrorBoundary resetKey={pathname}>
        <AppRoutes />
      </ErrorBoundary>
      {!isAuthPage && <BackToTopButton />}
      {isAdmin && <ZoomControl />}
      <VisitTracker />
      {!isAdmin && !isAuthPage && <WhatsAppButton />}
      {!isAdmin && <CompareBar />}
    </>
  );
}

export default App;
