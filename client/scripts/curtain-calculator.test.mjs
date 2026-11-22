// Curtain Size Calculator audit 2026-11-22 (CS-01/02/03/05/08), owner
// decisions D1-D7. We stock ONE panel width (4 ft = 48") in TWO lengths:
// 7x4 ft (84") and 9x4 ft (108"), written length x width. No other width,
// no custom stitching -- the calculator must never suggest anything else.
// Helper: src/utils/curtainCalculator.js.
//   node --test scripts/curtain-calculator.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import {
  CURTAIN_DEFAULTS,
  CURTAIN_PRESETS,
  CURTAIN_SIZES,
  CURTAIN_FAQS,
  FAQS_EN,
  calculateCurtain,
  countDesignsInStock,
  formatTip,
  formatError,
} from "../src/utils/curtainCalculator.js";

// Defaults (D1/D2/D3): outside mount, 4" overhang each side, 1.5x fullness,
// opens both sides, "just above floor" (-1").
const calc = (over = {}) => calculateCurtain({ ...CURTAIN_DEFAULTS, ...over });

test("defaults match D1-D3", () => {
  assert.deepEqual(CURTAIN_DEFAULTS, {
    widthIn: 48,
    dropIn: 84,
    mount: "outside",
    overhangIn: 4,
    fullness: 1.5,
    opening: "both",
    clearance: "above",
  });
});

test("only the two stocked sizes exist, written length x width", () => {
  assert.deepEqual(
    CURTAIN_SIZES.map((s) => [s.key, s.lengthIn, s.widthIn, s.label, s.labelHi, s.subcategorySlug]),
    [
      ["7x4", 84, 48, "7×4 ft", "7×4 फीट", "7x4-ft"],
      ["9x4", 108, 48, "9×4 ft", "9×4 फीट", "9x4-ft"],
    ],
  );
});

test("D7 presets are rod-to-floor measurements", () => {
  assert.deepEqual(
    CURTAIN_PRESETS.map((p) => [p.key, p.widthIn, p.dropIn]),
    [
      ["window", 48, 84],
      ["wide-window", 72, 84],
      ["door", 36, 88],
      ["tall-door", 60, 108],
    ],
  );
  for (const p of CURTAIN_PRESETS) assert.ok(p.label && p.labelHi, `${p.key} has EN+HI label`);
});

// ---- panels (CS-01/CS-03) ----

test("U1 default 48x84: rod 56, 2 panels (1.7x), final 83 -> 7x4 fits", () => {
  const r = calc();
  assert.equal(r.ok, true);
  assert.equal(r.rodLengthIn, 56);
  assert.equal(r.panels, 2);
  assert.equal(r.achievedFullness, 1.7);
  assert.equal(r.finalLengthIn, 83);
  assert.equal(r.size.key, "7x4");
  assert.equal(r.extraIn, 1);
  assert.equal(r.fits, true);
  assert.equal(r.tip, null);
});

test("U3 wide 120in window: 4 panels at 1.5x, no silent cap", () => {
  const r = calc({ widthIn: 120 });
  assert.equal(r.rodLengthIn, 128);
  assert.equal(r.panels, 4);
  assert.equal(r.achievedFullness, 1.5);
});

test("U4 60in opening both sides: 2.1 -> 3 -> 4 panels (2.8x)", () => {
  const r = calc({ widthIn: 60 });
  assert.equal(r.rodLengthIn, 68);
  assert.equal(r.panels, 4);
  assert.equal(r.achievedFullness, 2.8);
});

test("U4b 60in opening one side: 3 panels (2.1x)", () => {
  const r = calc({ widthIn: 60, opening: "one" });
  assert.equal(r.panels, 3);
  assert.equal(r.achievedFullness, 2.1);
});

test("U4c inside mount 48in: rod 48, 2 panels (2.0x)", () => {
  const r = calc({ mount: "inside" });
  assert.equal(r.rodLengthIn, 48);
  assert.equal(r.panels, 2);
  assert.equal(r.achievedFullness, 2);
});

test("both sides never gives an odd count; one side may", () => {
  for (let w = 12; w <= 300; w += 7) {
    assert.equal(calc({ widthIn: w }).panels % 2, 0, `width ${w}`);
  }
  assert.equal(calc({ widthIn: 20, mount: "inside", opening: "one" }).panels, 1);
});

// ---- clearance + length (CS-02/CS-03), D3/D5/D6 ----

test("U2 clearance order: just above < touching < puddle", () => {
  const above = calc({ clearance: "above" }).finalLengthIn;
  const touching = calc({ clearance: "touching" }).finalLengthIn;
  const puddle = calc({ clearance: "puddle" }).finalLengthIn;
  assert.deepEqual([above, touching, puddle], [83, 84, 87]);
  assert.equal(calc({ clearance: "above" }).size.key, "7x4");
  assert.equal(calc({ clearance: "touching" }).size.key, "7x4");
});

const assertTip = (r, direction, inches, sizeKey) => {
  assert.ok(r.tip, "tip expected");
  assert.equal(r.tip.direction, direction);
  assert.equal(r.tip.inches, inches);
  assert.equal(r.tip.size.key, sizeKey);
  // residual after moving the rod must be <= 2" (owner rule)
  const newFinal = r.finalLengthIn + (direction === "raise" ? inches : -inches);
  const residual = r.tip.size.lengthIn - newFinal;
  assert.ok(residual >= 0 && residual <= 2, `residual ${residual}`);
  assert.equal(r.tip.residualIn, residual);
};

test("U2 puddle: final 87 -> 9x4 (21in longer); tip lower 3in -> 7x4 exact", () => {
  const r = calc({ clearance: "puddle" });
  assert.equal(r.finalLengthIn, 87);
  assert.equal(r.size.key, "9x4");
  assert.equal(r.extraIn, 21);
  assert.equal(r.fits, false);
  assertTip(r, "lower", 3, "7x4");
});

test("U5 final 85 -> 9x4; tip lower 1in -> 7x4", () => {
  const r = calc({ dropIn: 85, clearance: "touching" });
  assert.equal(r.size.key, "9x4");
  assertTip(r, "lower", 1, "7x4");
});

test("U5 final 108 -> 9x4 exact, no tip", () => {
  const r = calc({ dropIn: 108, clearance: "touching" });
  assert.equal(r.size.key, "9x4");
  assert.equal(r.extraIn, 0);
  assert.equal(r.fits, true);
  assert.equal(r.tip, null);
});

test("U5 final 111 -> nothing fits, 9x4 3in short; tip lower 3in -> 9x4", () => {
  const r = calc({ dropIn: 111, clearance: "touching" });
  assert.equal(r.size, null);
  assert.equal(r.fits, false);
  assert.equal(r.shortByIn, 3);
  assertTip(r, "lower", 3, "9x4");
});

test("U5b final 115 -> nothing fits, 7in short, NO tip", () => {
  const r = calc({ dropIn: 115, clearance: "touching" });
  assert.equal(r.size, null);
  assert.equal(r.shortByIn, 7);
  assert.equal(r.tip, null);
});

test("U6 final 60 -> 7x4, 24in longer, NO tip (more than 6in)", () => {
  const r = calc({ dropIn: 60, clearance: "touching" });
  assert.equal(r.finalLengthIn, 60);
  assert.equal(r.size.key, "7x4");
  assert.equal(r.extraIn, 24);
  assert.equal(r.fits, false);
  assert.equal(r.tip, null);
});

test("U6b final 80 -> 7x4, 4in longer; tip raise 4in -> 7x4 exact", () => {
  const r = calc({ dropIn: 80, clearance: "touching" });
  assert.equal(r.size.key, "7x4");
  assert.equal(r.extraIn, 4);
  assertTip(r, "raise", 4, "7x4");
});

test("U6c 60in + just above -> final 59, 7x4 25in longer, no tip", () => {
  const r = calc({ dropIn: 60 });
  assert.equal(r.finalLengthIn, 59);
  assert.equal(r.extraIn, 25);
  assert.equal(r.tip, null);
});

test("D6 limits: raise up to 6in, lower up to 3in, never beyond", () => {
  assert.equal(calc({ dropIn: 78, clearance: "touching" }).tip?.inches, 6); // 84-78
  assert.equal(calc({ dropIn: 77, clearance: "touching" }).tip, null); // 7in
  assert.equal(calc({ dropIn: 87, clearance: "touching" }).tip?.inches, 3); // 87-84
  // 88: 9x4 is 20in long (> 6 raise) and 7x4 needs 4in lower (> 3) -> no tip
  assert.equal(calc({ dropIn: 88, clearance: "touching" }).tip, null);
});

test("every tip message states the frame condition (EN + HI)", () => {
  for (const over of [
    { clearance: "puddle" },
    { dropIn: 111, clearance: "touching" },
    { dropIn: 80, clearance: "touching" },
  ]) {
    const { tip } = calc(over);
    assert.match(formatTip(tip, "en"), /above the window\/door frame/);
    assert.match(formatTip(tip, "hi"), /फ्रेम के ऊपर/);
  }
});

// ---- CS-01: never any other size ----

test("U8 grid: result is always 7x4, 9x4 or no-fit", () => {
  for (let w = 12; w <= 300; w += 11) {
    for (let d = 24; d <= 144; d += 5) {
      for (const clearance of ["above", "touching", "puddle"]) {
        const r = calc({ widthIn: w, dropIn: d, clearance });
        assert.equal(r.ok, true);
        assert.ok(r.size === null || ["7x4", "9x4"].includes(r.size.key));
        if (r.size === null) assert.ok(r.finalLengthIn > 108 && r.shortByIn === r.finalLengthIn - 108);
        if (r.tip) assert.ok(["7x4", "9x4"].includes(r.tip.size.key));
      }
    }
  }
});

// ---- CS-05 validation ----

test("U7 invalid measurements give an error and no recommendation", () => {
  const cases = [
    [{ widthIn: "" }, "width", "required"],
    [{ widthIn: 0 }, "width", "range"],
    [{ widthIn: -20 }, "width", "range"],
    [{ widthIn: "abc" }, "width", "invalid"],
    [{ widthIn: 301 }, "width", "range"],
    [{ dropIn: "" }, "drop", "required"],
    [{ dropIn: 0 }, "drop", "range"],
    [{ dropIn: -5 }, "drop", "range"],
    [{ dropIn: 145 }, "drop", "range"],
    [{ overhangIn: -1 }, "overhang", "range"],
  ];
  for (const [over, field, code] of cases) {
    const r = calc(over);
    assert.equal(r.ok, false, JSON.stringify(over));
    assert.equal(r.errors[field], code, JSON.stringify(over));
    assert.equal(r.size, undefined);
    assert.equal(r.panels, undefined);
    assert.ok(formatError(field, code, "en").length > 0);
    assert.match(formatError(field, code, "hi"), /[ऀ-ॿ]/);
  }
  // inside mount ignores the (hidden) overhang field entirely
  assert.equal(calc({ mount: "inside", overhangIn: -1 }).ok, true);
});

// ---- D4 live stock ----

test("U9 stock counts designs per size with enough panels", () => {
  const products = [
    { _id: "A", isActive: true, variants: [{ size: "7x4", stock: 10 }, { size: "9x4", stock: 10 }] },
    { _id: "B", isActive: true, variants: [{ size: "7x4", stock: 1 }, { size: "9x4", stock: 1 }] },
    { _id: "C", isActive: true, variants: [{ size: "7x4", stock: 2 }, { size: "9x4", stock: 0 }] },
    { _id: "D", isActive: false, variants: [{ size: "7x4", stock: 10 }, { size: "9x4", stock: 10 }] },
    { _id: "E", isActive: true, stock: 20 }, // no variants -> never guessed
  ];
  assert.equal(countDesignsInStock(products, "7x4", 2), 2);
  assert.equal(countDesignsInStock(products, "9x4", 2), 1);
  assert.equal(countDesignsInStock(products, "7x4", 4), 1);
  assert.equal(countDesignsInStock(products, "7x4", 1), 3);
  assert.equal(countDesignsInStock(null, "7x4", 2), null);
  assert.equal(countDesignsInStock(undefined, "7x4", 2), null);
});

// ---- FAQ (CS-01/CS-08) ----

const UNSOLD = /\b(3|3\.5|4|4\.5|5|6|7)\s?x\s?(4|5|6|7|7\.5|8|9)\s?(ft|feet|फीट)\b/i;

test("FAQ never lists sizes we don't sell and says 1.5x is standard", () => {
  for (const f of CURTAIN_FAQS) {
    for (const text of [f.q, f.a, f.qHi, f.aHi]) {
      const cleaned = text.replace(/[79]×4 (ft|फीट)/g, "");
      assert.doesNotMatch(cleaned, UNSOLD, text);
      assert.doesNotMatch(text, /2x is standard|2x स्टैंडर्ड/, text);
    }
    assert.match(f.qHi + f.aHi, /[ऀ-ॿ]/);
  }
  assert.ok(CURTAIN_FAQS.some((f) => /7×4 ft/.test(f.a) && /9×4 ft/.test(f.a)));
  assert.deepEqual(FAQS_EN, CURTAIN_FAQS.map((f) => ({ q: f.q, a: f.a })));
});
