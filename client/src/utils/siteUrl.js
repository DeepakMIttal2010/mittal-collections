// Single source of truth for the canonical domain — every page building
// a canonical <link>/og:url, and breadcrumbJsonLd.js, import this
// instead of repeating the literal. Mirrored (duplicated, not imported)
// at client/api/sitemap.js and client/api/render.js, which are separate
// serverless functions that don't pull in anything from src/ — keep all
// three in sync if the domain ever changes.
export const SITE_URL = "https://www.mittalcollections.com";
