// URL parity for the homepage hero: the pre-painted <img> and the
// <link rel=preload> that build-home-html.mjs writes into home.html must
// ask for exactly the URLs the React Hero asks for, or the LCP image is
// downloaded twice (it was, from 2026-10-20 until this test's fix).
//   node --test scripts/build-home-html.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildHeroSnippet, buildPreloadLinkTag, heroImageUrls } from "./build-home-html.mjs";
import { HERO_IMAGE_SIZES } from "../src/utils/heroImage.js";

const IMAGE = "https://res.cloudinary.com/y2gghpvz/image/upload/v1789041201/mittal-collections/w701a44pqenkdbzdx1nu.jpg";
const at = (t) => IMAGE.replace("/upload/", `/upload/${t}/`);

// What the React Hero requested on the live site (audit, 2026-10-24):
// imgUrl(image, "w_1000,q_auto,f_auto") and imgSrcSet(image, [500, 800, 1200]).
const REACT_SRC = at("c_limit,w_1000,q_auto,f_webp");
const REACT_SRCSET = [500, 800, 1200].map((w) => `${at(`c_limit,w_${w},q_auto,f_webp`)} ${w}w`).join(", ");

const attr = (html, name) => html.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

test("hero URLs match the React Hero's imgUrl/imgSrcSet output", () => {
  assert.deepEqual(heroImageUrls(IMAGE), { src: REACT_SRC, srcset: REACT_SRCSET });
});

test("pre-painted <img> and preload request the same src, srcset and sizes", () => {
  const img = buildHeroSnippet(IMAGE);
  const preload = buildPreloadLinkTag(IMAGE);

  assert.equal(attr(img, "src"), REACT_SRC);
  assert.equal(attr(img, "srcset"), REACT_SRCSET);
  assert.equal(attr(img, "sizes"), HERO_IMAGE_SIZES);

  assert.equal(attr(preload, "href"), REACT_SRC);
  assert.equal(attr(preload, "imagesrcset"), REACT_SRCSET);
  assert.equal(attr(preload, "imagesizes"), HERO_IMAGE_SIZES);
  assert.equal(attr(preload, "fetchpriority"), "high");
  assert.equal(attr(img, "fetchpriority"), "high");
});

test("Hero.jsx builds its image from the same shared constants", () => {
  const hero = fs.readFileSync(new URL("../src/components/Hero/Hero.jsx", import.meta.url), "utf8");
  assert.match(hero, /imgUrl\(slide\.image, HERO_IMAGE_TRANSFORM\)/);
  assert.match(hero, /imgSrcSet\(slide\.image, HERO_IMAGE_SRCSET_WIDTHS\)/);
  assert.match(hero, /sizes=\{HERO_IMAGE_SIZES\}/);
});

test("non-Cloudinary images pass through untouched", () => {
  assert.deepEqual(heroImageUrls("/uploads/hero.jpg"), { src: "/uploads/hero.jpg", srcset: "" });
  assert.equal(buildHeroSnippet(null), "");
  assert.equal(buildPreloadLinkTag(""), "");
});
