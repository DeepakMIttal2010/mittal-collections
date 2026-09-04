import "dotenv/config";
import * as Sentry from "@sentry/node";

// Must be imported before anything else in server.js (see Sentry's own
// docs) so it can instrument modules as they load. Silently no-ops if
// SENTRY_DSN isn't set — never configured in local dev or CI (only in
// Render's production env vars), so neither environment sends anything
// to Sentry or slows down for it.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  // LocalVariablesAsync attaches Node's inspector/debugger protocol to
  // capture local variables in stack traces — confirmed to add ~4.3s to
  // this app's own startup (mongoose alone went from ~330ms to ~4.6s
  // once this integration was active), which is not worth the tradeoff
  // for a small API server. Everything else in the default set —
  // crucially OnUncaughtException/OnUnhandledRejection, the actual
  // point of this setup — stays enabled.
  integrations: (defaults) =>
    defaults.filter((integration) => integration.name !== "LocalVariablesAsync"),
});
