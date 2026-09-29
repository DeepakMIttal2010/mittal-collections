import {
  getAnalyticsDataClient,
  getSearchConsoleClient,
  GA4_PROPERTY_ID,
  SEARCH_CONSOLE_SITE_URL,
} from "../config/googleReporting.js";

const toDateString = (date) => date.toISOString().slice(0, 10);

// Search Console's data lags by 2-3 days — asking for "today" always
// returns an incomplete/empty final day, so the end date is pulled back
// to avoid a misleadingly low last day in the trend.
const SEARCH_CONSOLE_LAG_DAYS = 3;

export const getGoogleReportsData = async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 28, 7), 90);
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const gaStartDate = toDateString(startDate);
    const gaEndDate = toDateString(endDate);

    const scEnd = new Date();
    scEnd.setDate(scEnd.getDate() - SEARCH_CONSOLE_LAG_DAYS);
    const scStart = new Date(scEnd);
    scStart.setDate(scStart.getDate() - days);

    const analyticsData = getAnalyticsDataClient();
    const searchConsole = getSearchConsoleClient();

    const [summaryReport, topPagesReport, channelReport, deviceReport, scTotals, scTopQueries] =
      await Promise.all([
        analyticsData.properties.runReport({
          property: `properties/${GA4_PROPERTY_ID}`,
          requestBody: {
            dateRanges: [{ startDate: gaStartDate, endDate: gaEndDate }],
            metrics: [
              { name: "activeUsers" },
              { name: "sessions" },
              // GA4's own definition of an "engaged" session (lasted 10s+,
              // had a conversion event, or 2+ pageviews) already filters
              // out most low-quality/bot hits without needing a custom
              // bot list -- surfaced alongside raw sessions so the admin
              // can see the gap between "sessions GA4 counted" and
              // "sessions that look like a real visit" (see
              // pending_ga4_bot_filtering_2026-09-26 memory: raw sessions
              // was badly inflated by non-engaging traffic).
              { name: "engagedSessions" },
              { name: "screenPageViews" },
              { name: "engagementRate" },
            ],
          },
        }),

        analyticsData.properties.runReport({
          property: `properties/${GA4_PROPERTY_ID}`,
          requestBody: {
            dateRanges: [{ startDate: gaStartDate, endDate: gaEndDate }],
            dimensions: [{ name: "pagePath" }],
            metrics: [{ name: "screenPageViews" }],
            orderBys: [
              { metric: { metricName: "screenPageViews" }, desc: true },
            ],
            limit: 10,
          },
        }),

        // Which acquisition channel the low-engagement traffic is coming
        // through -- a channel that's almost all Direct with near-zero
        // engagement is the known bot-traffic signature here, as opposed
        // to real (if small) Organic Search / Referral traffic.
        analyticsData.properties.runReport({
          property: `properties/${GA4_PROPERTY_ID}`,
          requestBody: {
            dateRanges: [{ startDate: gaStartDate, endDate: gaEndDate }],
            dimensions: [{ name: "sessionDefaultChannelGroup" }],
            metrics: [{ name: "sessions" }, { name: "engagementRate" }],
            orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
            limit: 10,
          },
        }),

        // Device/browser mix — real customers in this niche skew heavily
        // mobile; a cluster of "desktop" sessions on one browser is a
        // useful tell for a scripted/headless-browser bot pattern.
        analyticsData.properties.runReport({
          property: `properties/${GA4_PROPERTY_ID}`,
          requestBody: {
            dateRanges: [{ startDate: gaStartDate, endDate: gaEndDate }],
            dimensions: [{ name: "deviceCategory" }, { name: "browser" }],
            metrics: [{ name: "sessions" }, { name: "engagementRate" }],
            orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
            limit: 10,
          },
        }),

        searchConsole.searchanalytics.query({
          siteUrl: SEARCH_CONSOLE_SITE_URL,
          requestBody: {
            startDate: toDateString(scStart),
            endDate: toDateString(scEnd),
          },
        }),

        searchConsole.searchanalytics.query({
          siteUrl: SEARCH_CONSOLE_SITE_URL,
          requestBody: {
            startDate: toDateString(scStart),
            endDate: toDateString(scEnd),
            dimensions: ["query"],
            rowLimit: 10,
          },
        }),
      ]);

    const summaryRow = summaryReport.data.rows?.[0]?.metricValues;

    const analytics = {
      activeUsers: Number(summaryRow?.[0]?.value || 0),
      sessions: Number(summaryRow?.[1]?.value || 0),
      engagedSessions: Number(summaryRow?.[2]?.value || 0),
      pageViews: Number(summaryRow?.[3]?.value || 0),
      engagementRate: summaryRow?.[4]?.value
        ? Number(summaryRow[4].value) * 100
        : 0,
      topPages: (topPagesReport.data.rows || []).map((row) => ({
        path: row.dimensionValues[0].value,
        views: Number(row.metricValues[0].value),
      })),
      byChannel: (channelReport.data.rows || []).map((row) => ({
        channel: row.dimensionValues[0].value,
        sessions: Number(row.metricValues[0].value),
        engagementRate: Number(row.metricValues[1].value) * 100,
      })),
      byDevice: (deviceReport.data.rows || []).map((row) => ({
        label: `${row.dimensionValues[0].value} / ${row.dimensionValues[1].value}`,
        sessions: Number(row.metricValues[0].value),
        engagementRate: Number(row.metricValues[1].value) * 100,
      })),
    };

    const scTotalsRow = scTotals.data.rows?.[0];

    const searchConsoleData = {
      clicks: scTotalsRow?.clicks || 0,
      impressions: scTotalsRow?.impressions || 0,
      ctr: scTotalsRow?.ctr ? scTotalsRow.ctr * 100 : 0,
      avgPosition: scTotalsRow?.position || 0,
      topQueries: (scTopQueries.data.rows || []).map((row) => ({
        query: row.keys[0],
        clicks: row.clicks,
        impressions: row.impressions,
        position: Math.round(row.position * 10) / 10,
      })),
    };

    res.status(200).json({
      success: true,
      dateRange: { startDate: gaStartDate, endDate: gaEndDate },
      analytics,
      searchConsole: searchConsoleData,
    });
  } catch (error) {
    console.error("Google reports error:", error.message);
    res.status(502).json({
      success: false,
      message:
        "Could not fetch Google Analytics / Search Console data. Check that GOOGLE_SERVICE_ACCOUNT_KEY is configured and the service account has been granted access in both GA4 and Search Console.",
    });
  }
};
