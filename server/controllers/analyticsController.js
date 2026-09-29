import { isIP } from "net";

import geoip from "geoip-lite";

import PageVisit from "../models/PageVisit.js";

const getDeviceType = (userAgent = "") => {
  const ua = userAgent.toLowerCase();

  if (/tablet|ipad/.test(ua)) return "Tablet";
  if (/mobi|android|iphone/.test(ua)) return "Mobile";

  return "Desktop";
};

// Traffic/conversion reports (getReportsData) exist to answer "how many
// real people visited, and how many of them acted" — a scraper or
// SEO/AI-crawl tool hitting /login or /checkout with no cart, no order,
// ever, silently inflates the visitor count and drags the funnel
// numbers toward zero without being a real customer at all. Confirmed
// this was happening in production 2026-09-09 (/login getting more
// PageVisit rows than every product page combined, visits from
// countries this Ghaziabad-only business has no real customers in).
// This can't catch everything — a bot that fully spoofs a real
// browser's UA slips through — but it removes the obvious, high-volume
// majority for free.
// Second line: tools that run a real browser but never say "bot" in
// their UA -- PageSpeed/Lighthouse, Google's URL Inspection and other
// "Google-*" fetchers, and uptime/performance monitors.
const BOT_USER_AGENT_PATTERN =
  /bot|crawl|spider|slurp|scraper|headless|phantomjs|selenium|puppeteer|playwright|python-requests|python-urllib|go-http-client|okhttp|java\/|curl\/|wget\/|postman|ahrefs|semrush|mj12bot|dotbot|bytespider|gptbot|chatgpt|claude-web|ccbot|perplexity|facebookexternalhit|linkedinbot|whatsapp|telegrambot|discordbot|uptimerobot|lighthouse|pagespeed|inspectiontool|google-|googleother|apis-google|mediapartners|feedfetcher|gtmetrix|pingdom|statuscake|site24x7|prerender/i;

const isBotUserAgent = (userAgent = "") => BOT_USER_AGENT_PATTERN.test(userAgent);

// isIP() alone confirms a string is shaped like an IP — it doesn't stop
// an attacker-controlled X-Forwarded-For from supplying a perfectly
// valid one that's still dangerous to fetch server-side: 169.254.169.254
// is the standard cloud metadata endpoint on AWS/GCP/Azure, and any
// 10.x/172.16-31.x/192.168.x address reaches whatever's on our own
// private network. That's the actual SSRF risk in getLocationWithFallback
// below, not just "is this text IP-shaped" — so anything in a
// private/loopback/link-local/reserved range is rejected here too.
// IPv6 is rejected outright rather than hand-rolling the equivalent
// IPv6 ranges — this live fallback only ever exists for the IPv4 CGNAT
// ranges geoip-lite's local database can't resolve (see the comment
// below), so nothing real is lost by not supporting it here.
const isPubliclyRoutableIPv4 = (ip) => {
  if (isIP(ip) !== 4) return false;

  const [a, b, c] = ip.split(".").map(Number);

  if (a === 0) return false; // 0.0.0.0/8
  if (a === 10) return false; // 10.0.0.0/8 private
  if (a === 100 && b >= 64 && b <= 127) return false; // 100.64.0.0/10 CGNAT
  if (a === 127) return false; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return false; // 169.254.0.0/16 link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12 private
  if (a === 192 && b === 0 && c === 0) return false; // 192.0.0.0/24 IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return false; // 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b === 168) return false; // 192.168.0.0/16 private
  if (a === 198 && (b === 18 || b === 19)) return false; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return false; // 224.0.0.0/4 multicast, 240.0.0.0/4 reserved, 255.255.255.255 broadcast

  return true;
};

// Geolocation is best-effort analytics/display data, not a security
// boundary (unlike the IP-keyed rate limiters in app.js, which must keep
// using Express's own hop-counted req.ip to resist spoofing) — so unlike
// req.ip, this doesn't need to trust an exact, fixed number of proxy
// hops. That fixed-count assumption (`trust proxy: 2`, see app.js) is
// wrong for a real, confirmed slice of production traffic: several
// Indian mobile carriers (Jio in particular) route requests through
// their own transparent proxy before they ever reach Render, adding an
// extra untrusted hop app.js's hop-count doesn't know about — req.ip
// then silently lands on that carrier's own proxy (or Render's edge)
// instead of the real visitor, recording as a random foreign country
// instead of India (confirmed live 2026-09-24: a request simulating an
// extra carrier-added hop resolved to Singapore/Tallahassee instead of
// the real client's IP, while a single-hop request resolved correctly).
// X-Forwarded-For is always built left-to-right as a request passes
// through each hop, so the leftmost entry is whichever IP the FIRST hop
// saw — the real client — regardless of how many untrusted hops follow
// it before reaching us.
const getClientIpForGeo = (req) => {
  const xff = req.headers["x-forwarded-for"];

  if (typeof xff === "string" && xff.trim()) {
    const candidate = xff.split(",")[0].trim();

    // The header is fully attacker-controlled (any client can set it to
    // literally anything) — getLocationWithFallback interpolates this
    // value straight into a URL for a real outbound fetch(), so an
    // unvalidated value here is a server-side request forgery vector,
    // not just a malformed-geolocation one. Only ever return something
    // that's actually a plausible real visitor IP (see
    // isPubliclyRoutableIPv4 above); anything else — an injected
    // hostname/URL, or a private/internal address — falls through to
    // req.ip below, same as a header that's absent entirely.
    if (isPubliclyRoutableIPv4(candidate)) return candidate;
  }

  return req.ip;
};

const getLocation = (rawIp = "") => {
  const ip = rawIp.replace("::ffff:", "");
  const geo = geoip.lookup(ip);

  return {
    country: geo?.country || "",
    region: geo?.region || "",
    city: geo?.city || "",
  };
};

// geoip-lite's free offline database frequently can't resolve a city for
// Indian mobile-carrier IPs (their large shared CGNAT ranges aren't well
// covered) — when that happens, callers relying on this for a visible
// customer-facing decision (e.g. "is this visitor near Ghaziabad", used to
// gate the delivery banner) were silently defaulting to their own
// optimistic fallback, which showed the Ghaziabad-only banner to visitors
// in completely unrelated cities. Only used for that low-frequency,
// UI-driving lookup — NOT for the high-frequency recordVisit analytics
// path, where blocking every page view on a third-party HTTP call isn't
// worth it for data that's already best-effort.
// Ghaziabad sits immediately on Delhi's eastern border and shares much of
// the capital's network/ISP infrastructure — both geoip-lite and live
// lookup services routinely resolve genuine Ghaziabad visitors as
// "Delhi"/"New Delhi" (there's no distinct, separately-routed IP block
// for it the way there is for a city further from the NCR core). This
// endpoint exists specifically for this Ghaziabad-based business's own
// "is this visitor local" checks — not as a general-purpose geolocation
// service — so correct for that known Delhi/Ghaziabad ambiguity here,
// once, rather than showing a literally-plausible-but-usually-wrong
// "Deliver to New Delhi" to what's very likely a Ghaziabad customer.
const normalizeLocation = (location) => {
  if (/^(new )?delhi$/i.test(location.city.trim())) {
    return { ...location, city: "Ghaziabad" };
  }

  return location;
};

const getLocationWithFallback = async (rawIp = "") => {
  const local = getLocation(rawIp);

  if (local.city) return normalizeLocation(local);

  const ip = rawIp.replace("::ffff:", "");

  // rawIp can originate from a client-controlled X-Forwarded-For header
  // (see getClientIpForGeo). Runtime-validating it (isPubliclyRoutableIPv4)
  // is still correct and kept as defense-in-depth, but CodeQL's
  // server-side-request-forgery query doesn't recognize a custom
  // validation function as clearing the alert no matter where it's
  // called from — same class of limitation already hit once this
  // session with a different alert, just not resolvable by adding more
  // validation this time. What actually satisfies it structurally: the
  // fetch URL below is now a fixed, hardcoded string with zero
  // interpolation — the IP goes in the POST body instead (ip-api.com's
  // batch endpoint, which accepts exactly one IP the same as the
  // single-IP endpoint did), so nothing user-controlled reaches the URL
  // CodeQL is tracking at all.
  if (!isPubliclyRoutableIPv4(ip)) return local;

  try {
    const response = await fetch(
      "http://ip-api.com/batch?fields=status,countryCode,regionName,city",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([ip]),
        signal: AbortSignal.timeout(2000),
      },
    );
    const [data] = await response.json();

    if (data?.status === "success") {
      return normalizeLocation({
        country: data.countryCode || local.country,
        region: data.regionName || local.region,
        city: data.city || "",
      });
    }
  } catch {
    // best-effort — fall through to whatever geoip-lite already gave us
  }

  return local;
};

// ============================
// Mark Internal Device (Admin)
// ============================
// Called once by a browser the moment an admin/staff account is signed
// in on it (see VisitTracker.jsx) -- that browser stops recording visits
// from then on, and its past visits are deleted here so reports only
// count real shoppers. Confirmed necessary 2026-09-24: the owner's own
// desktop browser alone was 4,762 of 9,041 visits (53%) over 90 days.
export const markInternalDevice = async (req, res) => {
  try {
    const { visitorId } = req.body;

    // Checked as a plain string before it reaches a Mongo filter -- an
    // object here would otherwise be treated as a query operator.
    if (typeof visitorId !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(visitorId)) {
      return res.status(400).json({
        success: false,
        message: "A valid visitorId is required",
      });
    }

    const { deletedCount } = await PageVisit.deleteMany({ visitorId });

    res.json({ success: true, deletedCount });
  } catch (error) {
    console.error("Mark Internal Device Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Get Product View Count — last 30 days (Public)
// ============================
export const getProductViewCount = async (req, res) => {
  try {
    const { id } = req.params;

    // id is compiled straight into a RegExp below — without this check, an
    // arbitrary string (this route is public/unauthenticated) could inject
    // regex metacharacters, including a pathological pattern MongoDB's
    // regex engine would then evaluate against every PageVisit document
    // (path has no index) — a real ReDoS surface, not just a malformed
    // query.
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product id",
      });
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Prefix match, not exact — a real product URL is /product/:id/:slug
    // (see productUrl.js), so an exact "/product/:id" match was missing
    // almost every visit and undercounting this badge.
    const visitorIds = await PageVisit.distinct("visitorId", {
      path: new RegExp(`^/product/${id}(/|$)`),
      createdAt: { $gte: since },
    });

    res.json({
      success: true,
      count: visitorIds.length,
    });
  } catch (error) {
    console.error("Get Product View Count Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Get My Location — IP-based approximate city (Public)
// ============================
export const getMyLocation = async (req, res) => {
  try {
    const { country, region, city } = await getLocationWithFallback(
      getClientIpForGeo(req),
    );

    res.json({
      success: true,
      location: { country, region, city },
    });
  } catch (error) {
    console.error("Get My Location Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Record Page Visit (Public)
// ============================
export const recordVisit = async (req, res) => {
  try {
    const { path, visitorId, userId } = req.body;

    if (!path || !visitorId) {
      return res.status(400).json({
        success: false,
        message: "path and visitorId are required",
      });
    }

    // Silently accept-and-drop rather than 4xx/5xx — a bot doesn't care
    // either way, and there's no reason to spend a Mongo write (or spend
    // any effort distinguishing further) on traffic these reports are
    // explicitly trying to exclude.
    if (isBotUserAgent(req.headers["user-agent"])) {
      return res.status(201).json({ success: true });
    }

    const device = getDeviceType(req.headers["user-agent"]);
    const { country, region, city } = getLocation(getClientIpForGeo(req));

    // userId comes straight from the request body, not decoded from a
    // token — this endpoint stays public/unauthenticated (every visitor,
    // logged in or not, hits it), the frontend just includes its own
    // AuthContext user id when one exists. Not treated as a trusted
    // identity claim anywhere sensitive, only used to show an admin a
    // customer's own browsing history.
    await PageVisit.create({
      path,
      visitorId,
      user: userId || null,
      device,
      country,
      region,
      city,
    });

    res.status(201).json({ success: true });
  } catch (error) {
    console.error("Record Visit Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
