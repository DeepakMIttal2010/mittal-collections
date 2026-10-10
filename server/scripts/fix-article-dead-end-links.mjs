// Round 22's content-to-commerce linking audit found 9 of 24 articles with
// ZERO outbound links of any kind (see pending_article_commerce_linking.md).
// Appends one short "Shop X ->" CTA paragraph per article, matching the
// exact pattern already established elsewhere in the catalog (e.g.
// towel-size-guide's `<p><a href="/category/towels">Shop cotton towels
// -></a></p>`), rather than inventing a new style. Multi-category articles
// get 2-3 links in one line, same shape as the "budget-bedroom-makeover"
// article's existing multi-link model.
//
// Comforters remains uncovered on purpose: none of these 9 articles are
// actually about comforters, and forcing an unrelated link in would repeat
// the exact "winter-blanket article mislinked to bedsheets" bug already
// fixed earlier this round -- that's a genuine content gap (no comforter
// buying-guide article exists yet), not a linking fix.
import { getArticleAdmin, updateArticleContent } from "./lib/adminArticleApi.mjs";

const BASE = "https://mittal-collections-api.onrender.com/api";
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) {
  console.error("Set ADMIN_TOKEN env var first.");
  process.exit(1);
}

const shopLinkEn = (slug, label) => `<p><a href="/category/${slug}">Shop ${label} &rarr;</a></p>`;
const shopLinkHi = (slug, label) => `<p><a href="/category/${slug}">${label} देखें &rarr;</a></p>`;

const FIXES = [
  {
    slug: "color-combination-guide-for-curtains-bedsheets-cushions",
    appendEn: [
      shopLinkEn("bedsheets", "bedsheets"),
      shopLinkEn("curtains", "curtains"),
      shopLinkEn("cushion-covers", "cushion covers"),
    ].join(" "),
    appendHi: [
      shopLinkHi("bedsheets", "चादरें"),
      shopLinkHi("curtains", "पर्दे"),
      shopLinkHi("cushion-covers", "कुशन कवर"),
    ].join(" "),
  },
  {
    slug: "curtain-measurement-guide",
    appendEn: shopLinkEn("curtains", "curtains"),
    appendHi: shopLinkHi("curtains", "पर्दे"),
  },
  {
    slug: "doormat-size-guide-which-size-for-entrance-bedroom-bathroom-kitchen",
    appendEn: shopLinkEn("doormats", "doormats"),
    appendHi: shopLinkHi("doormats", "पायदान"),
  },
  {
    slug: "fabric-comparison-guide-cotton-polyester-linen-silk",
    appendEn: [shopLinkEn("bedsheets", "bedsheets"), shopLinkEn("curtains", "curtains")].join(" "),
    appendHi: [shopLinkHi("bedsheets", "चादरें"), shopLinkHi("curtains", "पर्दे")].join(" "),
  },
  {
    slug: "intex-hit-me-inflatable-bop-bag-a-fun-punching-toy-that-always-bounces-back",
    appendEn: shopLinkEn("toys", "toys"),
    appendHi: shopLinkHi("toys", "खिलौने"),
  },
  {
    slug: "mattress-cover-guide-pvc-waterproof-vs-cotton-which-one-do-you-need",
    appendEn: shopLinkEn("mattress-covers", "mattress covers"),
    appendHi: shopLinkHi("mattress-covers", "मैट्रेस कवर"),
  },
  {
    slug: "room-decoration-ideas-with-home-furnishings",
    appendEn: [
      shopLinkEn("bedsheets", "bedsheets"),
      shopLinkEn("curtains", "curtains"),
      shopLinkEn("cushion-covers", "cushion covers"),
    ].join(" "),
    appendHi: [
      shopLinkHi("bedsheets", "चादरें"),
      shopLinkHi("curtains", "पर्दे"),
      shopLinkHi("cushion-covers", "कुशन कवर"),
    ].join(" "),
  },
  {
    slug: "table-cover-guide-pvc-lace-vs-clear-vinyl-vs-cotton-which-one-fits-your-table",
    appendEn: shopLinkEn("table-covers", "table covers"),
    appendHi: shopLinkHi("table-covers", "टेबल कवर"),
  },
  {
    slug: "table-runner-guide-cotton-velvet-jacquard-lace-which-one-for-which-occasion",
    appendEn: shopLinkEn("table-runners", "table runners"),
    appendHi: shopLinkHi("table-runners", "टेबल रनर"),
  },
];

for (const fix of FIXES) {
  const article = await getArticleAdmin(BASE, fix.slug, TOKEN);
  console.log(`\n${article.title} (${article._id})`);

  if (article.content.includes('href="/category/') || article.content.includes("curtain-size-calculator")) {
    console.log("  note: already has at least one link; appending anyway per scope (dead-end check was for zero links, not zero commerce links)");
  }

  const payload = {
    content: article.content + "\n" + fix.appendEn,
    contentHi: article.contentHi + "\n" + fix.appendHi,
  };

  const { status, data } = await updateArticleContent(BASE, article._id, payload, TOKEN);
  console.log(`  -> PUT status ${status}, success=${data.success}`);
  if (!data.success) console.log("  ", JSON.stringify(data));
}
