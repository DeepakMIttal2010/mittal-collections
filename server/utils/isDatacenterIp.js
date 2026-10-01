import { Netmask } from "netmask";

// Catches the bot traffic BOT_USER_AGENT_PATTERN (analyticsController.js)
// can't: automation that runs an actual Chrome/Playwright browser with a
// normal, unmodified UA string (confirmed live 2026-10-01 — several
// admin-visible "New Visitors" rows, all Desktop/Chrome, all exactly one
// homepage hit and never seen again, from Ashburn/Wuppertal/London/etc —
// Ashburn, VA specifically is the single most common AWS us-east-1 EC2
// location, not a plausible residential visitor to a Ghaziabad-only
// delivery business). A browser UA alone can't distinguish "real person"
// from "a scraper renting a cloud box", but the IP it's running from can.
//
// Deliberately sourced live from AWS's and Google Cloud's own official,
// freely-published IP-range feeds instead of a hand-maintained CIDR list
// committed here — those ranges genuinely change over time, and a
// human-transcribed list going stale (or simply mistyped) risks the much
// worse failure mode of silently dropping a REAL visitor's page view.
// Fails open on every error path (fetch failure, bad JSON, not-yet-loaded
// at a fresh cold start): isDatacenterIp() returns false, i.e. "don't
// filter", rather than ever risk blocking genuine traffic.
const AWS_RANGES_URL = "https://ip-ranges.amazonaws.com/ip-ranges.json";
const GCP_RANGES_URL = "https://www.gstatic.com/ipranges/cloud.json";

// Render's free tier spins the whole process down on inactivity (see
// post_merge_deploy_lag_gotcha-era findings this session) — every cold
// start means an empty cache until this first fetch resolves, and a full
// re-download. Refreshed on an interval rather than once, since the
// published ranges do change and a long-lived (non-free-tier, or just
// busy enough to stay warm) process shouldn't run forever on day-one data.
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

let blocks = [];
let loaded = false;

async function fetchRanges() {
  const nextBlocks = [];

  try {
    const res = await fetch(AWS_RANGES_URL);
    const data = await res.json();
    // Scoped to the EC2 service specifically (actual compute instances —
    // what a scraping/automation box runs on) rather than AWS's full
    // ~10,500-prefix list, which also covers CloudFront and other
    // services real visitors legitimately traverse (e.g. a site fronted
    // by CloudFront) and would be wrong to treat as "this is a bot".
    for (const p of data.prefixes || []) {
      if (p.service === "EC2" && p.ip_prefix) {
        try {
          nextBlocks.push(new Netmask(p.ip_prefix));
        } catch {
          // malformed prefix from the feed — skip it, don't abort the batch
        }
      }
    }
  } catch (error) {
    console.error("isDatacenterIp: AWS range fetch failed:", error.message);
  }

  try {
    const res = await fetch(GCP_RANGES_URL);
    const data = await res.json();
    for (const p of data.prefixes || []) {
      const cidr = p.ipv4Prefix;
      if (cidr) {
        try {
          nextBlocks.push(new Netmask(cidr));
        } catch {
          // malformed prefix from the feed — skip it, don't abort the batch
        }
      }
    }
  } catch (error) {
    console.error("isDatacenterIp: GCP range fetch failed:", error.message);
  }

  // Only replace the live list if at least one provider's fetch actually
  // produced something — a run where both fetches failed (e.g. Render's
  // outbound network having a bad moment) keeps serving the last good
  // list instead of silently clearing it back to "filter nothing".
  if (nextBlocks.length > 0) {
    blocks = nextBlocks;
    loaded = true;
  }
}

// Fire-and-forget at module load, then on a recurring timer — recordVisit
// never awaits this, so a slow/failed fetch can't delay or break page-visit
// recording itself.
fetchRanges();
setInterval(fetchRanges, REFRESH_INTERVAL_MS).unref();

export const isDatacenterIp = (rawIp) => {
  if (!loaded || !rawIp) return false;

  // Mirrors analyticsController.js's own getLocation() — req.ip (the
  // fallback path when there's no X-Forwarded-For) can come back as an
  // IPv4-mapped IPv6 address ("::ffff:1.2.3.4"), which Netmask's IPv4
  // parsing doesn't understand and would otherwise just never match.
  const ip = rawIp.replace("::ffff:", "");

  try {
    // A genuine (non-mapped) IPv6 address isn't something Netmask (IPv4
    // only) can parse at all — contains() throws rather than returning
    // false for it. This feed doesn't cover IPv6 ranges either way, so
    // treat anything unparseable the same as "not a known datacenter".
    return blocks.some((block) => block.contains(ip));
  } catch {
    return false;
  }
};
