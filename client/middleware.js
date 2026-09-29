import { rewrite, next } from "@vercel/edge";

// Handles exactly the one gap client/api/render.js's own comment already
// documents: vercel.json's rewrite rules correctly send a bot to
// /api/render for /product/*, /category/*, /articles/* (there's no static
// file at those paths to compete with), but Vercel serves the static
// index.html straight from disk for an exact "/" request — that takes
// precedence over vercel.json's `rewrites` regardless of the bot
// user-agent `has` condition, so a bare-domain WhatsApp/Facebook share
// always saw the generic shell instead of buildMeta()'s already-written
// homepage branch in render.js. Edge Middleware runs earlier in the
// request pipeline than that static-file lookup, so it's the one place
// that can actually intercept "/" before Vercel serves the file — this
// file's only job is routing that one case to the endpoint that already
// knows how to handle it.
//
// Keep this regex identical to the `has` user-agent pattern in
// vercel.json's product/category/article rewrites — they exist to
// recognise the same set of bots, just via two different Vercel
// mechanisms (a rewrite `has` condition can't match on an exact-file
// path like "/", which is exactly why this middleware exists instead).
const BOT_USER_AGENT =
  /([bB]ot|Google|facebookexternalhit|WhatsApp|Pinterest|embedly|Quora Link Preview|Slurp|ia_archiver|Discordbot|TelegramBot|redirectionio)/;

// The canonical frontend host — every <link rel="canonical">, sitemap
// entry and JSON-LD @id across the site already uses SITE_URL
// (https://www.mittalcollections.com), so this is the only host that
// should ever serve a 200. Every Vercel project also gets a permanent
// *.vercel.app domain that serves the exact same site alongside this,
// with no redirect of its own — a visitor who lands there (an old shared
// link, a search engine that indexed it, anyone typing it directly) gets
// a fully broken page: every API fetch fails "Not allowed by CORS" since
// that domain was never in the allowlist (confirmed live via a real
// Sentry production error, 12 events over 12 days, 2026-09-16). The bare
// apex (mittalcollections.com, no www) has the same problem for SEO
// specifically even though CORS allows it (server/app.js's
// ALLOWED_ORIGINS lists it too, for any lingering direct API callers) —
// left un-redirected, it's a second fully crawlable host serving
// identical content, splitting crawl budget/link signal instead of
// being a hard 301 onto the one canonical URL every page already claims.
// Redirect any host that isn't the canonical one, apex included, rather
// than trying to special-case every domain Vercel might ever hand out.
const CANONICAL_HOST = "www.mittalcollections.com";

export const config = {
  matcher: "/:path*",
};

export default function middleware(request) {
  const url = new URL(request.url);

  if (
    url.hostname !== CANONICAL_HOST &&
    !url.hostname.startsWith("localhost")
  ) {
    url.hostname = CANONICAL_HOST;
    url.protocol = "https:";
    url.port = "";
    return Response.redirect(url, 301);
  }

  const userAgent = request.headers.get("user-agent") || "";

  if (url.pathname === "/" && BOT_USER_AGENT.test(userAgent)) {
    return rewrite(new URL("/api/render?path=/", request.url));
  }

  return next();
}
