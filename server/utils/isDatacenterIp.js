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
// Deliberately sourced live from each provider's own official, freely-
// published IP-range feed instead of a hand-maintained CIDR list committed
// here — those ranges genuinely change over time, and a human-transcribed
// list going stale (or simply mistyped) risks the much worse failure mode
// of silently dropping a REAL visitor's page view. Fails open on every
// error path (fetch failure, bad JSON, not-yet-loaded at a fresh cold
// start): isDatacenterIp() returns false, i.e. "don't filter", rather
// than ever risk blocking genuine traffic.
//
// AWS + GCP only, originally (2026-10-01). Re-checked the same day after
// a fresh batch of fake guest wishlist/cart activity correlated with
// zero matching PageVisits turned up visitor "locations" (Wuppertal DE,
// Ireland, Ukraine) that AWS/GCP's ranges don't cover — not every
// scraping box runs on the two biggest clouds. Added DigitalOcean and
// Oracle Cloud (OCI), the next two with a stable, parseable public feed;
// Azure's is a rotating signed-URL download (no fixed endpoint to poll)
// and Hetzner/OVH don't publish one at all, so those remain uncovered —
// documented here rather than silently assumed-handled.
const AWS_RANGES_URL = "https://ip-ranges.amazonaws.com/ip-ranges.json";
const GCP_RANGES_URL = "https://www.gstatic.com/ipranges/cloud.json";
const DIGITALOCEAN_RANGES_URL = "https://digitalocean.com/geo/google.csv";
const ORACLE_RANGES_URL = "https://docs.oracle.com/iaas/tools/public_ip_ranges.json";

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
    const res = await fetch(AWS_RANGES_URL, { signal: AbortSignal.timeout(8000) });
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
    const res = await fetch(GCP_RANGES_URL, { signal: AbortSignal.timeout(8000) });
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

  try {
    const res = await fetch(DIGITALOCEAN_RANGES_URL, { signal: AbortSignal.timeout(8000) });
    const text = await res.text();
    // Plain CSV, no header row: "ip_prefix,country,region,city,postal".
    // Only the first column matters here.
    for (const line of text.split("\n")) {
      const cidr = line.split(",")[0]?.trim();
      if (cidr) {
        try {
          nextBlocks.push(new Netmask(cidr));
        } catch {
          // malformed/blank line — skip it, don't abort the batch
        }
      }
    }
  } catch (error) {
    console.error("isDatacenterIp: DigitalOcean range fetch failed:", error.message);
  }

  try {
    const res = await fetch(ORACLE_RANGES_URL, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    for (const region of data.regions || []) {
      for (const c of region.cidrs || []) {
        if (c.cidr) {
          try {
            nextBlocks.push(new Netmask(c.cidr));
          } catch {
            // malformed prefix from the feed — skip it, don't abort the batch
          }
        }
      }
    }
  } catch (error) {
    console.error("isDatacenterIp: Oracle Cloud range fetch failed:", error.message);
  }

  // Only replace the live list if at least one provider's fetch actually
  // produced something — a run where every fetch failed (e.g. Render's
  // outbound network having a bad moment) keeps serving the last good
  // list instead of silently clearing it back to "filter nothing".
  if (nextBlocks.length > 0) {
    blocks = nextBlocks;
    loaded = true;
  }
}

// Fire-and-forget at module load, then on a recurring timer — recordVisit
// never awaits this (see isDatacenterIp's own cold-start handling below),
// so a slow/failed fetch can't delay or break page-visit recording itself.
let initialLoad = fetchRanges();
setInterval(fetchRanges, REFRESH_INTERVAL_MS).unref();

// Render's free tier spins the whole process down on inactivity — every
// cold start means the very first requests can arrive before
// `initialLoad` resolves. Originally this just fell through the `!loaded`
// check below and failed open (silently let a real AWS/GCP box through
// for that one request) — low-traffic hours are exactly when a cold
// start AND a scraper's one-off hit are both most likely, which is
// probably why several same-day "New Visitors" rows slipped past this
// filter despite being on since 2026-10-01. Now a request arriving during
// that window waits up to 2s for the in-flight fetch instead of skipping
// the check outright; 2s is a small, bounded tax on the first few
// requests after a cold start, not on every request going forward.
const WAIT_FOR_INITIAL_LOAD_MS = 2000;

export const isDatacenterIp = async (rawIp) => {
  if (!loaded && initialLoad) {
    await Promise.race([
      initialLoad,
      new Promise((resolve) => setTimeout(resolve, WAIT_FOR_INITIAL_LOAD_MS)),
    ]);
    initialLoad = null; // only worth waiting on once per process lifetime
  }

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
