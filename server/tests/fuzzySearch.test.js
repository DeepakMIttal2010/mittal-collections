import { describe, it, expect } from "vitest";

import { rankProducts, scoreProduct } from "../utils/fuzzySearch.js";

const doormat = {
  name: "Bricks Design Cotton Doormat 15x22 Inches - Maroon/Red",
  description: "A stylish anti-slip doormat for your entrance.",
};
const bedsheet = {
  name: "Jaipuri Floral Print Cotton Double Bedsheet 93x108 Inches",
  description: "Soft cotton bedsheet with 2 pillow covers.",
};
const cushionCovers = {
  name: "Rose Pink Butterfly Print Cushion Covers 16x16 Inches - Set of 5",
  description: "A set of 5 cushion covers.",
};

const catalog = [doormat, bedsheet, cushionCovers];

describe("fuzzySearch Hindi/Hinglish synonyms", () => {
  it("matches a Romanized Hindi word to its English product term", () => {
    expect(rankProducts("paaydaan", catalog)).toEqual([doormat]);
    expect(rankProducts("chaadar", catalog)).toEqual([bedsheet]);
    expect(rankProducts("gaddi", catalog)).toEqual([cushionCovers]);
  });

  it("matches the same word written in Devanagari", () => {
    expect(rankProducts("पायदान", catalog)).toEqual([doormat]);
    expect(rankProducts("चादर", catalog)).toEqual([bedsheet]);
    expect(rankProducts("कुशन", catalog)).toEqual([cushionCovers]);
  });

  it("still matches plain English queries exactly as before", () => {
    expect(rankProducts("doormat", catalog)).toEqual([doormat]);
    expect(rankProducts("bedsheet", catalog)).toEqual([bedsheet]);
  });

  it("does not match unrelated Hindi/Hinglish words to anything", () => {
    expect(scoreProduct("तौलिया", doormat)).toBe(0); // towel word, not a doormat
    expect(rankProducts("xyzxyz", catalog)).toEqual([]);
  });

  it("does not throw or crash on Devanagari-only queries with no catalog match", () => {
    expect(() => rankProducts("रजाई", catalog)).not.toThrow();
    expect(rankProducts("रजाई", catalog)).toEqual([]);
  });
});

describe("fuzzySearch multi-word relevance (regression, 2026-10-13)", () => {
  // Confirmed live: searching a specific 6-word product name returned
  // the ENTIRE catalog (162/162 products), just reordered, because any
  // product whose description happened to contain even one common word
  // (e.g. "white") from the query scored > 0 and was included.
  // SearchResults.jsx has no result cap, so a customer scrolling down a
  // specific search would eventually see totally unrelated products.
  const veebaComforter = {
    name: "Veeba White Lilly Reversible Microfibre Comforter, Double Bed 90x72 inches - Blue Cream Paisley",
    description: "A reversible double-bed comforter with a blue cream paisley print on one side.",
  };
  // Shares no real words with the query below except the single common
  // word "soft" (bedsheet) / "with" (cushionCovers) buried in its own
  // description -- exactly the coincidental-overlap shape that used to
  // incorrectly pull unrelated products into a specific-name search.
  const multiWordCatalog = [veebaComforter, doormat, bedsheet, cushionCovers];

  it("only returns the genuinely matching product for a specific multi-word product-name query, not the whole catalog", () => {
    const results = rankProducts(
      "Veeba White Lilly Reversible Microfibre Comforter",
      multiWordCatalog,
    );
    expect(results).toEqual([veebaComforter]);
  });

  it("still matches on a short query needing only one real word match (unchanged behavior)", () => {
    expect(rankProducts("doormat", multiWordCatalog)).toEqual([doormat]);
    expect(rankProducts("bedsheet", multiWordCatalog)).toEqual([bedsheet]);
  });
});
