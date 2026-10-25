// Build-time nav categories snapshot: writes the nav fields in API order
// on a good response, never overwrites the last known good snapshot on a
// failed fetch or a body it can't trust.
//   node --test scripts/fetch-nav-categories.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { snapshotNavCategories } from "./fetch-nav-categories.mjs";
import { parseNavCategoriesResponse, toNavCategories } from "../src/utils/navCategories.js";

const API = [
  { _id: "6a6453c92bdcd87c2e0ce708", name: "Bedsheets", nameHi: "बेडशीट", slug: "bedsheets", description: "long text", image: "x.jpg", displayOrder: 0, productCount: 60 },
  { _id: "6abcb82e598c3c49f7f067ba", name: "Comforters", nameHi: "कंफर्टर", slug: "comforters", displayOrder: 1 },
  { _id: "6a6453c92bdcd87c2e0ce70a", name: "Curtains", nameHi: "पर्दे", slug: "curtains", displayOrder: 2 },
];
const SNAP = API.map(({ _id, name, nameHi, slug }) => ({ _id, name, nameHi, slug }));
const LAST_GOOD = JSON.stringify([{ _id: "old", name: "Old Category", nameHi: "पुरानी", slug: "old" }], null, 2) + "\n";

const quiet = { log() {}, warn() {} };
const tmpFile = (existing) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nav-categories-"));
  const file = path.join(dir, "navCategoriesSnapshot.json");
  if (existing !== undefined) fs.writeFileSync(file, existing);
  return file;
};
const jsonResponse = (body, status = 200) => ({ ok: status < 400, status, statusText: "x", json: async () => body });
const run = (outPath, fetchImpl, attempts = 2) =>
  snapshotNavCategories({ apiBase: "http://api.test/api", outPath, fetchImpl, attempts, retryDelayMs: 0, log: quiet });
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

test("requests /api/categories and writes only the nav fields, in API order", async () => {
  const file = tmpFile(LAST_GOOD);
  const urls = [];
  const result = await run(file, async (u) => (urls.push(u), jsonResponse({ success: true, categories: API })));
  assert.deepEqual(urls, ["http://api.test/api/categories"]);
  assert.deepEqual(result, { written: true, count: 3 });
  assert.deepEqual(read(file), SNAP);
});

test("a missing Hindi name is kept as an empty string, not dropped", () => {
  assert.deepEqual(toNavCategories([{ _id: "a", name: "Toys", slug: "toys" }]), [{ _id: "a", name: "Toys", nameHi: "", slug: "toys" }]);
});

test("HTTP and network failures keep the last known good snapshot byte for byte", async () => {
  for (const fetchImpl of [
    async () => { throw new Error("ECONNRESET"); },
    async () => jsonResponse({ success: false, message: "Server Error" }, 500),
    async () => jsonResponse({}, 404),
  ]) {
    const file = tmpFile(LAST_GOOD);
    assert.deepEqual(await run(file, fetchImpl), { written: false });
    assert.equal(fs.readFileSync(file, "utf8"), LAST_GOOD);
  }
});

test("malformed bodies keep the last known good snapshot byte for byte", async () => {
  const bodies = [
    { success: false, categories: API },
    { success: true },
    { success: true, categories: "nope" },
    { success: true, categories: [...API, { name: "No id", slug: "x" }] },
    { success: true, categories: [{ ...API[0], slug: "" }] },
    { success: true, categories: [{ ...API[0], name: "  " }] },
    null,
  ];
  for (const body of bodies) {
    const file = tmpFile(LAST_GOOD);
    assert.deepEqual(await run(file, async () => jsonResponse(body)), { written: false }, JSON.stringify(body));
    assert.equal(fs.readFileSync(file, "utf8"), LAST_GOOD);
  }
  const file = tmpFile(LAST_GOOD);
  await run(file, async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } }));
  assert.equal(fs.readFileSync(file, "utf8"), LAST_GOOD);
});

test("with no snapshot at all, a failed fetch writes an empty list so the build import resolves", async () => {
  const file = tmpFile();
  assert.deepEqual(await run(file, async () => { throw new Error("offline"); }), { written: false });
  assert.deepEqual(read(file), []);
});

test("retries a cold-starting API, then succeeds", async () => {
  const file = tmpFile(LAST_GOOD);
  let calls = 0;
  const result = await run(file, async () => (++calls === 1 ? jsonResponse({}, 503) : jsonResponse({ success: true, categories: API })), 3);
  assert.equal(calls, 2);
  assert.equal(result.written, true);
});

test("parseNavCategoriesResponse / toNavCategories", () => {
  assert.deepEqual(parseNavCategoriesResponse({ success: true, categories: API }), SNAP);
  assert.equal(parseNavCategoriesResponse({ success: false, categories: API }), null);
  assert.equal(toNavCategories(null), null);
  assert.deepEqual(toNavCategories([]), []);
});

test("the committed snapshot is valid nav data", () => {
  const committed = JSON.parse(fs.readFileSync(new URL("../src/data/navCategoriesSnapshot.json", import.meta.url), "utf8"));
  assert.ok(Array.isArray(committed) && committed.length > 0);
  assert.deepEqual(toNavCategories(committed), committed);
});
