import * as Sentry from "@sentry/react";

// Imported first in main.jsx, before React ever mounts, so even an
// error during initial render is captured. Silently no-ops if
// VITE_SENTRY_DSN isn't set — deliberately left unset in local dev,
// only set in Vercel's production env vars (mirrors server/instrument.js).
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
});
