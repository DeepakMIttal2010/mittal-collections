// Reminder-email opt-out page (src/pages/ReminderUnsubscribe.jsx): opening
// the link must not opt out by itself (email scanners prefetch links) —
// only the explicit button click calls the service — and the page must be
// registered, noindexed for bots, and bilingual.
//   node --test scripts/reminder-unsubscribe.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const page = read("src/pages/ReminderUnsubscribe.jsx");

test("opt-out happens only on the button click, never on load", () => {
  const calls = page.match(/optOutOfReminderEmails\(/g) || [];
  assert.equal(calls.length, 1, "service called exactly once in the page");
  assert.match(page, /const handleOptOut = async \(\) => \{\s*setStatus\("loading"\);\s*const data = await optOutOfReminderEmails\(token\);/);
  assert.match(page, /onClick=\{handleOptOut\}/);
  // The only effect moves focus; it must not call the service.
  const effect = page.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[status\]\);/)[0];
  assert.doesNotMatch(effect, /optOutOfReminderEmails/);
});

test("the service POSTs the token to the opt-out endpoint", () => {
  const svc = read("src/services/reminderEmailService.js");
  assert.match(svc, /\/reminder-emails\/opt-out/);
  assert.match(svc, /method: "POST"/);
  assert.match(svc, /JSON\.stringify\(\{ token \}\)/);
});

test("the page is routed and noindexed (React and bot prerender)", () => {
  assert.match(read("src/routes/AppRoutes.jsx"), /path="\/reminders\/unsubscribe" element=\{<ReminderUnsubscribe \/>\}/);
  assert.match(page, /<Seo title="Reminder emails" noindex \/>/);
  assert.ok(read("api/render.js").includes("/^\\/reminders\\/unsubscribe$/,"));
});

test("EN and HI copy says both reminders stop and the newsletter is unaffected", () => {
  assert.ok(page.includes("This stops both cart reminder and wishlist price-drop emails. It does not change your newsletter subscription."));
  assert.ok(page.includes("इससे कार्ट रिमाइंडर और विशलिस्ट की कीमत घटने वाले, दोनों तरह के ईमेल बंद हो जाएँगे। आपके न्यूज़लेटर सब्सक्रिप्शन पर कोई असर नहीं पड़ेगा।"));
  for (const [en, hi] of [
    ["Invalid link", "अमान्य लिंक"],
    ["Reminders turned off", "रिमाइंडर बंद कर दिए गए"],
    ["Couldn't turn off reminders", "रिमाइंडर बंद नहीं हो सके"],
    ["Yes, stop these reminders", "हां, ये रिमाइंडर बंद करें"],
  ]) {
    assert.ok(page.includes(`t("${en}", "${hi}")`), en);
  }
});

test("a malformed token never reaches the server", () => {
  assert.match(page, /const TOKEN_PATTERN = \/\^\[a-f0-9\]\{48\}\$\/;/);
  assert.match(page, /\{!validLink \? \(/);
});
