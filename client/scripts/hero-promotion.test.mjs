// Homepage hero promotion tracking rules (src/utils/heroPromotion.js).
//   node --test scripts/hero-promotion.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import { createHeroViewTracker, deviceCategory, heroPromotionParams } from "../src/utils/heroPromotion.js";

const SLIDES = [
  { _id: "6a6b21db4038729abb9e217f", title: "Transform Every Corner\nof Your Home", subtitle: "PREMIUM HOME FURNISHING", image: "https://res.cloudinary.com/y2gghpvz/image/upload/v1789041201/mittal-collections/w701a44pqenkdbzdx1nu.jpg" },
  { _id: "6a6b21db4038729abb9e2180", title: "Elegant Curtains For Every Window" },
  { _id: "6a6b21db4038729abb9e2181", title: "3D Print Bedsheets With 2 Pillow Covers" },
];

const tracker = () => {
  const sent = [];
  const track = createHeroViewTracker((p) => sent.push(p));
  return { sent, track };
};

test("device classification follows the layout breakpoints", () => {
  assert.equal(deviceCategory(360), "mobile");
  assert.equal(deviceCategory(767), "mobile");
  assert.equal(deviceCategory(768), "tablet");
  assert.equal(deviceCategory(1023), "tablet");
  assert.equal(deviceCategory(1024), "desktop");
  assert.equal(deviceCategory(1920), "desktop");
  assert.equal(deviceCategory(undefined), "desktop");
  assert.equal(deviceCategory(0), "desktop");
});

test("parameters come from the banner data, slot from the displayed position", () => {
  assert.deepEqual(heroPromotionParams(SLIDES[0], 0, 1366), {
    promotion_id: "6a6b21db4038729abb9e217f",
    promotion_name: "Transform Every Corner of Your Home",
    creative_slot: "homepage_hero_1",
    device: "desktop",
  });
  assert.equal(heroPromotionParams(SLIDES[2], 2, 390).creative_slot, "homepage_hero_3");
  assert.equal(heroPromotionParams(SLIDES[2], 2, 390).device, "mobile");
});

test("missing id falls back to the image file name, then (not set); missing title to the subtitle, then (not set)", () => {
  const noId = { title: "Gift Bedsheets", image: "https://res.cloudinary.com/x/image/upload/v1/mittal-collections/cozy-gift-1.jpg?x=1" };
  assert.equal(heroPromotionParams(noId, 0, 1366).promotion_id, "cozy-gift-1");
  assert.equal(heroPromotionParams({ title: "No image" }, 0, 1366).promotion_id, "(not set)");
  assert.equal(heroPromotionParams({ _id: "  " , title: "Blank id" }, 0, 1366).promotion_id, "(not set)");
  assert.equal(heroPromotionParams({ _id: "a", subtitle: "NEW ARRIVALS" }, 0, 1366).promotion_name, "NEW ARRIVALS");
  assert.equal(heroPromotionParams({ _id: "a", title: "  " }, 0, 1366).promotion_name, "(not set)");
});

test("the bundled fallback slide and missing slides are never tracked", () => {
  assert.equal(heroPromotionParams({ _id: "fallback", title: "Transform Every Corner" }, 0, 1366), null);
  assert.equal(heroPromotionParams(undefined, 3, 1366), null);
  const { sent, track } = tracker();
  track({ slides: [{ _id: "fallback", title: "x" }], activeIndex: 0, visible: true, width: 1366 });
  track({ slides: SLIDES, activeIndex: 9, visible: true, width: 1366 });
  assert.equal(sent.length, 0);
});

test("initial slide is tracked once it is visible, not before", () => {
  const { sent, track } = tracker();
  track({ slides: SLIDES, activeIndex: 0, visible: false, width: 1366 }); // first render, observer not fired yet
  assert.equal(sent.length, 0);
  track({ slides: SLIDES, activeIndex: 0, visible: true, width: 1366 });
  assert.deepEqual(sent.map((p) => p.creative_slot), ["homepage_hero_1"]);
});

test("autoplay and manual navigation: each newly shown slide once; revisits and re-renders send nothing", () => {
  const { sent, track } = tracker();
  const show = (i) => track({ slides: SLIDES, activeIndex: i, visible: true, width: 1366 });
  show(0);
  show(0); // re-render / StrictMode double effect
  show(1); // autoplay
  show(2); // autoplay
  show(0); // wraps around
  show(1); // manual dot click back to a seen slide
  show(2);
  assert.deepEqual(sent.map((p) => p.promotion_id), SLIDES.map((s) => s._id));
});

test("slides that rotate while the hero is off screen or the tab is hidden are not counted", () => {
  const { sent, track } = tracker();
  track({ slides: SLIDES, activeIndex: 0, visible: true, width: 390 });
  track({ slides: SLIDES, activeIndex: 1, visible: false, width: 390 }); // scrolled away / background tab
  track({ slides: SLIDES, activeIndex: 2, visible: false, width: 390 });
  assert.equal(sent.length, 1);
  track({ slides: SLIDES, activeIndex: 2, visible: true, width: 390 }); // back on screen showing slide 3
  assert.deepEqual(sent.map((p) => p.creative_slot), ["homepage_hero_1", "homepage_hero_3"]);
});

test("the snapshot being replaced by the same banners from the API does not re-send them", () => {
  const { sent, track } = tracker();
  track({ slides: SLIDES, activeIndex: 0, visible: true, width: 1366 });
  const fromApi = SLIDES.map((s) => ({ ...s }));
  track({ slides: fromApi, activeIndex: 0, visible: true, width: 1366 });
  assert.equal(sent.length, 1);
});

test("separate page loads (separate trackers) each count their own views", () => {
  const a = tracker();
  const b = tracker();
  a.track({ slides: SLIDES, activeIndex: 0, visible: true, width: 1366 });
  b.track({ slides: SLIDES, activeIndex: 0, visible: true, width: 1366 });
  assert.equal(a.sent.length + b.sent.length, 2);
});

test("analytics sends GA4 view_promotion / select_promotion with the banner as the single item", async () => {
  const calls = [];
  globalThis.window = { gtag: (...args) => calls.push(args) };
  try {
    const { trackViewPromotion, trackSelectPromotion } = await import("../src/utils/analytics.js");
    const params = heroPromotionParams(SLIDES[1], 1, 390);
    trackViewPromotion(params);
    trackSelectPromotion(params);
    const item = { item_id: SLIDES[1]._id, item_name: "Elegant Curtains For Every Window", promotion_id: SLIDES[1]._id, promotion_name: "Elegant Curtains For Every Window", creative_slot: "homepage_hero_2" };
    assert.deepEqual(calls, [
      ["event", "view_promotion", { ...params, items: [item] }],
      ["event", "select_promotion", { ...params, items: [item] }],
    ]);
    assert.equal(params.device, "mobile");
  } finally {
    delete globalThis.window;
  }
});
