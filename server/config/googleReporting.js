import { google } from "googleapis";

const GA4_PROPERTY_ID = "548724604";
const SEARCH_CONSOLE_SITE_URL = "sc-domain:mittalcollections.com";

let authClient = null;

// Lazily built — throws only when a report is actually requested, not at
// server startup, since this is an optional feature that shouldn't block
// boot if GOOGLE_SERVICE_ACCOUNT_KEY isn't configured yet.
const getAuthClient = () => {
  if (authClient) return authClient;

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not configured");
  }

  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);

  authClient = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/webmasters.readonly",
    ],
  });

  return authClient;
};

export const getAnalyticsDataClient = () =>
  google.analyticsdata({ version: "v1beta", auth: getAuthClient() });

export const getSearchConsoleClient = () =>
  google.searchconsole({ version: "v1", auth: getAuthClient() });

export { GA4_PROPERTY_ID, SEARCH_CONSOLE_SITE_URL };
