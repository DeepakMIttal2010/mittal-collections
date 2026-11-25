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

describe("fuzzySearch Hinglish words for what the catalog calls something else (2026-10-23)", () => {
  const tulip = {
    name: "Tulip Original Reversible Microfibre Comforter, Double Bed 90x72 inches - Sage Grey Peony Floral",
    description: "A reversible double-bed comforter.",
  };
  const dohar = { name: "Sparsh Cotton Dohar Single Bed 60x90 Inches - Blue", description: "A light cotton dohar." };
  const mattressCover = { name: "Waterproof PVC Mattress Cover 72x78 Inches - Charcoal Grey", description: "A wipe-clean mattress protector." };
  const tableCover = { name: "Central Table Cover 40x60 Inches - Grey Sunflower Net", description: "A net table cover." };
  const shop = [tulip, dohar, mattressCover, tableCover, doormat, bedsheet, cushionCovers];

  it("razai / kambal / blanket find the comforters and dohars the catalog sells", () => {
    for (const q of ["razai", "रजाई", "kambal", "कंबल", "blanket"]) {
      expect(rankProducts(q, shop)).toEqual(expect.arrayContaining([tulip, dohar]));
      expect(rankProducts(q, shop)).not.toContain(doormat);
    }
  });

  it("a one-word search that expands to several catalog words still needs only that one word", () => {
    // "tulip razai": 2 typed words -> needs 1 of them; the comforter has both
    expect(rankProducts("tulip razai", shop)[0]).toBe(tulip);
    expect(rankProducts("razai", shop)).toContain(tulip);
  });

  it("Devanagari words seen in Search Console match", () => {
    expect(rankProducts("कंफर्टर", shop)).toEqual([tulip]);
    expect(rankProducts("बेडशीट", shop)).toEqual([bedsheet]);
  });

  it("gadda, mezposh, toliya and chaddar spellings map to the catalog word", () => {
    expect(rankProducts("gadda cover", shop)[0]).toBe(mattressCover);
    expect(rankProducts("mezposh", shop)).toEqual([tableCover]);
    expect(rankProducts("chaddar", shop)).toEqual([bedsheet]);
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

// Search audit 2026-11-24 (SR-01/SR-02). Real site searches returned most
// of the catalogue ("king size bed sheet" 155 of 199, "blanket covers" 161,
// "grey color" 183) or the wrong category ("dohars" -> 7 doormats, "towel"
// -> bedsheets whose description mentions towels). A small catalogue shaped
// like the real one; names, categories and subcategories as the API
// populates them.
describe("fuzzySearch relevance: real queries (search audit 2026-11-24)", () => {
  const cat = (name) => ({ name });
  const sub = (...names) => names.map((name) => ({ name }));
  const kingFlannel = {
    name: "Royal Blue Gulmohar Winter Flannel King Size Bedsheet 90x108 Inches + 2 Pillow Covers",
    category: cat("Bedsheets"),
    subcategories: sub("King Size", "Winter Flannel Bedsheets", "90 x 108 Inches"),
    description: "A warm flannel king size bedsheet for winter nights.",
  };
  const fittedKing = {
    name: "Maruti Fitted Double Bedsheet with 2 Pillow Covers - Navy Grey",
    category: cat("Bedsheets"),
    subcategories: sub("Double Bed Size", "Fitted Bedsheet", "King Size"),
    description: "Elastic fitted bedsheet in cotton blend.",
  };
  const doubleVictory = {
    name: "Mustard Floral Victory Double Bedsheet 225x225 cm + 2 Pillow Covers",
    category: cat("Bedsheets"),
    subcategories: sub("Double Bed Size", "88 x 88 Inches"),
    description: "Soft cotton blend double bedsheet, easy to wash like a towel.",
  };
  const tulip90x100 = {
    name: "Tulip Three-Piece Double Bedsheet Set 90x100 Inch with 2 Pillow Covers - Blue Grey",
    category: cat("Bedsheets"),
    subcategories: sub("Double Bed Size", "90 x 100 Inches"),
    description: "Cotton bedsheet set.",
  };
  const hotelSheet = {
    name: "White Hotel Bedsheet 230x250 cm - Double",
    category: cat("Hotel Linen"),
    subcategories: sub("Double Bed Size"),
    description: "Hotel-grade sheet; launder with your towels at 60 degrees.",
  };
  const doormatA = {
    name: "Navy Cotton Large Doormat 21x31 Inches",
    category: cat("Doormats"),
    subcategories: sub("Cotton Doormats"),
    description: "Place it at the door; dries fast. Not a dohar.",
  };
  const dohar = {
    name: "Sparsh Sweet Dream Reversible Cotton Dohar, Single Bed 152x228 cm",
    category: cat("Dohars"),
    subcategories: sub("Single Bed Size"),
    description: "Light cotton dohar.",
  };
  const comforter = {
    name: "Tulip Original Reversible Microfibre Comforter, Double Bed 90x72 inches",
    category: cat("Comforters"),
    subcategories: sub("Double Bed Size", "Tulip"),
    description: "A soft microfibre comforter.",
  };
  const towel = {
    name: "myTrident Home Essential Cotton Bath Towel - Red Wine, 75 x 150 cm",
    category: cat("Towels"),
    subcategories: sub("Bath Towels"),
    description: "Absorbent cotton bath towel.",
  };
  const toy = {
    name: "Intex Hit Me Inflatable Bop Bag Toy - Tiger, Sand-Filled Weighted Base",
    category: cat("Toys"),
    subcategories: sub("Inflatable Toys"),
    description: "Sand-filled punching toy.",
  };
  const tableCover = {
    name: "Central Table Cover 40x60 Inches - Grey Sunflower Net",
    category: cat("Table Covers"),
    subcategories: sub("Net Table Covers"),
    description: "Net table cover.",
  };
  const greyDoormat = {
    name: "Double Colour Cotton Doormat 16x24 Inches - Grey",
    category: cat("Doormats"),
    subcategories: sub("Cotton Doormats"),
    description: "Two-tone doormat in many colours.",
  };
  const catalog = [kingFlannel, fittedKing, doubleVictory, tulip90x100, hotelSheet, doormatA, dohar, comforter, towel, toy, tableCover, greyDoormat];
  const names = (results) => results.map((p) => p.name).sort();
  const only = (...items) => items.map((p) => p.name).sort();

  it("'king size bed sheet' returns only king-size bedsheets, name matches first", () => {
    const results = rankProducts("king size bed sheet", catalog);
    expect(names(results)).toEqual(only(kingFlannel, fittedKing));
    expect(results[0]).toBe(kingFlannel);
  });

  it("'dohars' (plural) returns the dohar, not doormats that mention a door", () => {
    expect(rankProducts("dohars", catalog)).toEqual([dohar]);
    expect(rankProducts("dohar", catalog)).toEqual([dohar]);
  });

  it("'towel' returns towels, not bedsheets whose description mentions towels", () => {
    expect(rankProducts("towel", catalog)).toEqual([towel]);
  });

  it("'blanket covers' returns comforters and dohars only ('covers' is a generic word)", () => {
    expect(names(rankProducts("blanket covers", catalog))).toEqual(only(dohar, comforter));
  });

  it("'grey color' returns grey products only, not everything that mentions a colour", () => {
    expect(names(rankProducts("grey color", catalog))).toEqual(only(fittedKing, tulip90x100, tableCover, greyDoormat));
  });

  it("'table cover' does not match 'Inflatable' (word start, not any substring)", () => {
    expect(rankProducts("table cover", catalog)).toEqual([tableCover]);
  });

  it("'fitted' does not match 'Filled' (one typo allowed up to 6 letters)", () => {
    expect(rankProducts("fitted", catalog)).toEqual([fittedKing]);
  });

  it("sizes: '90 x 100', '90X100' and '90x100' all find the 90x100 set and nothing else", () => {
    for (const q of ["90 x 100", "90X100", "90x100", "90 × 100"]) {
      expect(rankProducts(q, catalog), q).toEqual([tulip90x100]);
    }
  });

  it("'warm bedsheets' keeps description-only 'warm' bedsheets but ranks name/category matches first", () => {
    const results = rankProducts("warm bedsheets", catalog);
    expect(results[0]).toBe(kingFlannel);
    expect(results.every((p) => ["Bedsheets", "Hotel Linen"].includes(p.category.name))).toBe(true);
  });

  it("generic-only queries ('bed size', 'cover', 'set') still return results, not zero", () => {
    for (const q of ["bed size", "cover", "set"]) {
      expect(rankProducts(q, catalog).length, q).toBeGreaterThan(0);
    }
  });

  it("typos and Hindi/Hinglish still work: curtan-style typo, chaddar, चादर, कम्बल, khilona", () => {
    expect(rankProducts("bedshet", catalog).length).toBeGreaterThan(0);
    expect(rankProducts("comfortr", catalog)).toEqual([comforter]);
    expect(rankProducts("chaddar", catalog).length).toBe(5);
    expect(rankProducts("चादर", catalog).length).toBe(5);
    expect(names(rankProducts("कम्बल", catalog))).toEqual(only(dohar, comforter));
    expect(rankProducts("khilona", catalog)).toEqual([toy]);
  });

  it("products without category/subcategory data (autocomplete select) still match by name", () => {
    const bare = catalog.map(({ name, description }) => ({ name, description }));
    expect(rankProducts("dohars", bare).map((p) => p.name)).toEqual([dohar.name]);
  });
});
