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
