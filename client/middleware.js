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
  /([bB]ot|facebookexternalhit|WhatsApp|Pinterest|embedly|Quora Link Preview|Slurp|ia_archiver|Discordbot|TelegramBot|redirectionio)/;

export const config = {
  matcher: "/",
};

export default function middleware(request) {
  const userAgent = request.headers.get("user-agent") || "";

  if (BOT_USER_AGENT.test(userAgent)) {
    return rewrite(new URL("/api/render?path=/", request.url));
  }

  return next();
}
