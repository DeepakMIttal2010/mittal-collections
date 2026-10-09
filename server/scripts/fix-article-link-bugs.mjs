// Two real article-linking bugs found by round 22's content-to-commerce
// audit (2026-10-09):
// 1. "choosing-the-right-blanket-for-winter" links to /category/bedsheets
//    ("Explore our bedding collection") instead of /category/dohars, even
//    though a sibling article correctly links the same winter-blanket
//    topic to /category/dohars. Both the English and Hindi content have
//    the identical mislink.
// 2. "budget-bedroom-makeover-ideas-..."'s Hindi content links to
//    /category/pillows, which doesn't exist as a real category route
//    (only /category/cushions does -- /pillows is a redirect, not a
//    valid /category/ path) -- a broken/dead-end link. The English
//    version of the same article already correctly uses /category/cushions.
import { getArticleAdmin, updateArticleContent } from "./lib/adminArticleApi.mjs";

const BASE = "https://mittal-collections-api.onrender.com/api";
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) {
  console.error("Set ADMIN_TOKEN env var first.");
  process.exit(1);
}

const FIXES = [
  {
    slug: "choosing-the-right-blanket-for-winter",
    content: {
      from: `href="/category/bedsheets">bedding collection`,
      to: `href="/category/dohars">dohars &amp; blankets collection`,
    },
    contentHi: {
      from: `href="/category/bedsheets">बिस्तर कलेक्शन`,
      to: `href="/category/dohars">दोहर और कंबल कलेक्शन`,
    },
  },
  {
    slug: "budget-bedroom-makeover-ideas-that-actually-work",
    contentHi: {
      from: `/category/pillows`,
      to: `/category/cushions`,
    },
  },
];

for (const fix of FIXES) {
  const article = await getArticleAdmin(BASE, fix.slug, TOKEN);
  console.log(`\n${article.title} (${article._id})`);

  const payload = {};
  if (fix.content) {
    if (!article.content.includes(fix.content.from)) {
      console.log("  SKIP content: exact substring not found, check manually");
    } else {
      payload.content = article.content.replace(fix.content.from, fix.content.to);
      console.log("  content: will replace", JSON.stringify(fix.content.from));
    }
  }
  if (fix.contentHi) {
    if (!article.contentHi.includes(fix.contentHi.from)) {
      console.log("  SKIP contentHi: exact substring not found, check manually");
    } else {
      payload.contentHi = article.contentHi.replace(fix.contentHi.from, fix.contentHi.to);
      console.log("  contentHi: will replace", JSON.stringify(fix.contentHi.from));
    }
  }

  if (Object.keys(payload).length === 0) {
    console.log("  nothing to update, skipping");
    continue;
  }

  const { status, data } = await updateArticleContent(BASE, article._id, payload, TOKEN);
  console.log(`  -> PUT status ${status}, success=${data.success}`);
  if (!data.success) console.log("  ", JSON.stringify(data));
}
