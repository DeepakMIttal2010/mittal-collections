// Round 31 #2: the unsubscribe links in our emails carry a personal token
// (/reminders/unsubscribe?t=...) and, for the newsletter, the subscriber's
// email address (/newsletter/unsubscribe?email=...&token=...). GA4's
// page_view and Meta Pixel's PageView send the full page URL, so those
// went to Google and Meta (Meta got the email address unredacted). The
// analytics loader in index.html must not run on these pages -- the same
// way it already skips /admin and local hosts.
//
// Runs index.html's real inline loader script in a sandbox with a fake
// browser location, and checks whether gtag/fbq were set up.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const html = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "index.html"),
  "utf8",
);

// The inline loader: the body of the plain <script> block that sets up
// gtag. Plain string search, not an HTML-matching regex -- this only reads
// our own index.html.
const loader = (() => {
  const configAt = html.indexOf('gtag("config"');
  if (configAt === -1) return null;
  const open = "<script>";
  const start = html.lastIndexOf(open, configAt);
  const end = html.indexOf("</" + "script>", configAt);
  return start === -1 || end === -1 ? null : html.slice(start + open.length, end);
})();

const runLoader = (url) => {
  const { hostname, pathname, search } = new URL(url);
  const appended = [];
  const sandbox = {
    location: { hostname, pathname, search, href: url },
    document: {
      createElement: () => ({}),
      head: { appendChild: (el) => appended.push(el) },
    },
    addEventListener: (type, fn) => type === "load" && fn(),
  };
  sandbox.window = sandbox;
  vm.runInNewContext(loader, sandbox);
  return {
    ga: Array.isArray(sandbox.dataLayer) && sandbox.dataLayer.length > 0,
    meta: typeof sandbox.fbq === "function",
    scripts: appended.map((el) => el.src),
  };
};

const SITE = "https://www.mittalcollections.com";

test("the analytics loader script is found in index.html", () => {
  assert.ok(loader, "inline gtag/fbq loader script not found");
});

test("analytics still load on normal pages", () => {
  for (const p of ["/", "/hi", "/category/bedsheets", "/product/x", "/my-orders", "/unsubscribe-guide"]) {
    const r = runLoader(SITE + p);
    assert.equal(r.ga, true, `GA4 should load on ${p}`);
    assert.equal(r.meta, true, `Meta Pixel should load on ${p}`);
    assert.equal(r.scripts.length, 2, `both scripts on ${p}`);
  }
});

test("no GA4 or Meta Pixel on the reminder unsubscribe page", () => {
  const r = runLoader(`${SITE}/reminders/unsubscribe?t=${"a".repeat(48)}`);
  assert.deepEqual(r, { ga: false, meta: false, scripts: [] });
});

test("no GA4 or Meta Pixel on the newsletter unsubscribe page", () => {
  const r = runLoader(`${SITE}/newsletter/unsubscribe?email=a%40example.com&token=abc`);
  assert.deepEqual(r, { ga: false, meta: false, scripts: [] });
});

test("also blocked with a trailing slash or under the Hindi prefix", () => {
  for (const p of ["/reminders/unsubscribe/?t=x", "/newsletter/unsubscribe/?email=a", "/hi/reminders/unsubscribe?t=x", "/hi/newsletter/unsubscribe?token=x"]) {
    const r = runLoader(SITE + p);
    assert.deepEqual(r, { ga: false, meta: false, scripts: [] }, p);
  }
});

test("/admin and localhost stay blocked", () => {
  assert.deepEqual(runLoader(`${SITE}/admin/orders`), { ga: false, meta: false, scripts: [] });
  assert.deepEqual(runLoader("http://localhost:5173/"), { ga: false, meta: false, scripts: [] });
});
