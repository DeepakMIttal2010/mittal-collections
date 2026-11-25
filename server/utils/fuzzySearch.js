// Small-catalog text search — no external search service needed.
//
// Rules (search audit 2026-11-24, SR-01/SR-02 — real searches like "king
// size bed sheet", "blanket covers" and "grey color" returned 150-180 of
// ~200 products, and "dohars" returned doormats):
//  1. Words are lower-cased; sizes written "90 x 100" / "90X100" / "90×100"
//     become one token "90x100"; a plural ("dohars", "covers") also matches
//     its singular — on both the query and the product side.
//  2. Adjacent query words the catalogue writes as one word are merged
//     ("bed sheet" -> "bedsheet", "door mat" -> "doormat").
//  3. GENERIC words (size, bed, color, cover, set...) never have to match on
//     their own; if the whole query is generic words, they are required.
//  4. Every other ("required") word must match the product somewhere:
//     - its name (10 points) or category/subcategory names (7): exact,
//       plural, word-start, or a typo (1 edit up to 6 letters, 2 from 7;
//       never for numbers/sizes);
//     - its description (3): the exact word or its plural only — no
//       substrings, no typos (that is how "dohars" hit "door").
//  5. At least one required word must match the name or category — a
//     product matched only by its description is not a result.
//  Hindi/Hinglish words map to the catalogue's English words (table below)
//  and those match whole words only.

const levenshtein = (a, b) => {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }

  return dp[m][n];
};

const normalize = (text) =>
  (text || "")
    .toLowerCase()
    .trim()
    // One token per size, whichever way it is written (rule 1).
    .replace(/(\d)\s*[x×*]\s*(\d)/g, "$1x$2")
    // Keeps Devanagari alongside Latin/digits, not just a-z0-9 —
    // otherwise a Hindi-script query gets stripped to nothing before it
    // ever reaches the synonym lookup below. A \p{Script=...} property
    // escape rather than a hardcoded ऀ-ॿ range — several code
    // points in that block are combining marks, which eslint's
    // no-misleading-character-class rule (rightly) flags as ambiguous
    // when spelled out as a literal range.
    .replace(/[^a-z0-9\s\p{Script=Devanagari}]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

// A word plus its singular forms: "dohars" -> dohar; "covers" -> cover;
// "boxes" -> box/boxe. Words ending in "ss" ("glass") and short words are
// left alone.
const forms = (word) => {
  if (word.length <= 3 || word.endsWith("ss")) return [word];
  if (word.endsWith("es") && word.length > 4) return [word, word.slice(0, -2), word.slice(0, -1)];
  if (word.endsWith("s")) return [word, word.slice(0, -1)];
  return [word];
};

// Rule 3. Exact words only (checked on the singular form too).
const GENERIC = new Set([
  "size", "sized", "bed", "color", "colour", "cover", "set", "piece", "pcs",
  "inch", "inches", "ft", "with", "for", "and", "of", "the", "x",
]);
const isGeneric = (word) => forms(word).some((f) => GENERIC.has(f));

// This catalog is home textiles for an Indian audience where plenty of
// shoppers — especially outside the big metros — search in Hindi or
// Hinglish rather than English. Fuzzy/typo matching alone can't bridge
// two genuinely different words for the same thing ("पायदान" and
// "doormat" aren't a few edits apart), so common terms are mapped
// directly to the English catalog word they mean, in both Devanagari
// and the most common Romanized spellings.
// Each entry: the words a shopper may type (Devanagari and the common
// Romanized spellings) -> the catalog's own English word(s). One word can
// point at several catalog words: shoppers say "razai" or "kambal" for
// what the catalog sells as a Comforter or a Dohar (GSC also shows
// "tulip blanket" searches), so those map to all of them.
const HINDI_SYNONYMS = [
  { to: ["doormat"], words: ["पायदान", "पाएदान", "पैदान", "paaydaan", "paydan", "paydaan", "payadan"] },
  { to: ["bedsheet"], words: ["चादर", "चदर", "चद्दर", "बेडशीट", "बिस्तर", "chaadar", "chadar", "chader", "chaddar", "chadder", "bistar", "bistara"] },
  { to: ["cushion"], words: ["कुशन", "गद्दी", "kushan", "gaddi"] },
  { to: ["pillow"], words: ["तकिया", "तकिए", "takiya", "takia", "takiye"] },
  { to: ["cover"], words: ["गिलाफ", "गिलाफ़", "gilaf", "ghilaf", "gilaaf"] },
  { to: ["towel"], words: ["तौलिया", "तौलिए", "तोलिया", "tauliya", "taulia", "tauliye", "toliya", "tolia", "towliya"] },
  { to: ["curtain"], words: ["पर्दा", "पर्दे", "परदा", "parda", "pardaa", "parde", "pardey"] },
  { to: ["comforter"], words: ["कम्फर्टर", "कंफर्टर", "कम्फ़र्टर", "कंफ़र्टर", "kamforter"] },
  { to: ["comforter", "dohar", "quilt"], words: ["रजाई", "रज़ाई", "rajai", "razai", "rajaai", "razaai", "quilt"] },
  { to: ["comforter", "dohar", "blanket"], words: ["कंबल", "कम्बल", "kambal", "kambel", "kambl", "blanket", "blankets"] },
  { to: ["dohar"], words: ["दोहर", "दोहड़", "dohad"] },
  { to: ["mattress"], words: ["गद्दा", "गद्दे", "gadda", "gaddaa", "gadde"] },
  { to: ["table"], words: ["मेज़पोश", "मेजपोश", "mezposh", "mejposh"] },
  { to: ["table"], words: ["मेज़", "मेज", "टेबल", "mez", "mej"] },
  { to: ["runner"], words: ["रनर"] },
  { to: ["toy"], words: ["खिलौना", "खिलौने", "khilona", "khilone", "khilauna"] },
  { to: ["cleaning"], words: ["पोछा", "पोंछा", "pocha", "pochha", "ponchha"] },
  { to: ["diwan"], words: ["दीवान", "deewan", "dewan", "diwaan"] },
];

const HINDI_TO_ENGLISH = new Map(
  HINDI_SYNONYMS.flatMap(({ to, words }) => words.map((word) => [word.toLowerCase(), to])),
);

// The query is user input. Only its first MAX_QUERY_WORDS words are read,
// with the bound applied right here in the loop (not only by callers) so
// no loop ever runs over an unbounded user-supplied list. A real search is
// a handful of words.
const MAX_QUERY_WORDS = 20;

// Rule 2: merge adjacent query words the catalogue writes as one word.
const mergeCompounds = (words, vocab) => {
  const out = [];
  if (!Array.isArray(words)) return out;
  const count = Math.min(words.length, MAX_QUERY_WORDS);
  for (let i = 0; i < count; i++) {
    const pair = i + 1 < count ? words[i] + words[i + 1] : null;
    if (pair && forms(pair).some((f) => vocab.has(f))) {
      out.push(pair);
      i++;
    } else {
      out.push(words[i]);
    }
  }
  return out;
};

// One group per query word: the words that count as a match for it. A
// Hindi/Hinglish word adds the catalogue word(s) it means and then matches
// whole words only (typos and word-starts made "dohar" match "door" and
// "toy" match "top" in the past).
const queryGroups = (query, vocab) =>
  mergeCompounds(normalize(query), vocab).map((word) => {
    const mapped = HINDI_TO_ENGLISH.get(word);
    return {
      terms: mapped ? [...forms(word), ...mapped] : forms(word),
      exactOnly: Boolean(mapped),
      generic: isGeneric(word),
    };
  });

const categoryText = (product) =>
  [
    product.category?.name,
    ...(Array.isArray(product.subcategories) ? product.subcategories.map((s) => s?.name) : []),
  ]
    .filter(Boolean)
    .join(" ");

const textField = (text) => {
  const words = normalize(text);
  return { words, forms: new Set(words.flatMap(forms)) };
};

// Points for one query group against one field (name / category), 0 if
// it doesn't match. Exact, plural or word-start: full points; a typo:
// fewer. Word-start, not any substring: "table" must not match
// "inflatable".
const matchField = (group, field, full) => {
  for (const term of group.terms) {
    if (field.forms.has(term)) return full;
    if (!group.exactOnly && term.length >= 3 && field.words.some((w) => w.startsWith(term))) return full;
  }
  if (group.exactOnly) return 0;

  const term = group.terms[0];
  // No typo matching for numbers/sizes: "90x100" must not match "90x108".
  if (/\d/.test(term)) return 0;
  // 1 edit up to 6 letters ("curtan"), 2 from 7 ("comfortr"); "fitted"
  // must not match "filled".
  const tolerance = term.length <= 6 ? 1 : 2;
  let best = Infinity;
  for (const word of field.words) {
    const distance = levenshtein(term, word);
    if (distance < best) best = distance;
  }
  return best <= tolerance ? Math.max(1, full - 4 - best) : 0;
};

const vocabularyOf = (products) =>
  new Set(products.flatMap((p) => normalize(`${p.name || ""} ${categoryText(p)}`)));

// Score of one product for a query (0 = not a result). `vocab` is the
// catalogue's name/category words, used to merge compound words (rule 2);
// without it the query words are used as typed.
export const scoreProduct = (query, product, vocab = new Set()) => {
  // Same 100-character cut as rankProducts, applied here too: scoreProduct
  // is exported and must not rely on its caller to bound user input.
  const groups = queryGroups(String(query || "").slice(0, MAX_QUERY_LENGTH), vocab);
  if (groups.length === 0) return 0;
  const required = groups.every((g) => g.generic) ? groups : groups.filter((g) => !g.generic);

  const name = textField(product.name);
  const category = textField(categoryText(product));
  const description = textField(product.description).forms;

  let score = 0;
  let nameOrCategoryMatch = false;
  for (const group of groups) {
    const nameLevel = matchField(group, name, 10) || matchField(group, category, 7);
    const descriptionLevel = nameLevel ? 0 : group.terms.some((t) => description.has(t)) ? 3 : 0;
    if (required.includes(group)) {
      if (!nameLevel && !descriptionLevel) return 0; // rule 4
      if (nameLevel) nameOrCategoryMatch = true;
    }
    score += nameLevel || descriptionLevel;
  }
  return nameOrCategoryMatch ? score : 0; // rule 5
};

// No caller (getProducts' public ?search=, getSearchSuggestions' public
// autocomplete hit on every keystroke) ever capped query length before
// this reached scoreProduct -> levenshtein, which is O(word-length ×
// word-length) per catalog word with no early exit. A single ~50-80KB
// request body containing one giant whitespace-free "word" (so
// normalize() can't split it) turns into tens of thousands of large
// Levenshtein calls against the full, unfiltered catalog -- easily
// seconds of synchronous CPU blocking Node's single event loop for
// EVERY request site-wide, with no auth and no rate limiter on either
// endpoint (deep bug sweep, 2026-10-20). A real product/catalog search
// term is never remotely this long, so truncating is safe and
// invisible to a genuine shopper.
const MAX_QUERY_LENGTH = 100;

export const rankProducts = (query, products) => {
  const safeQuery = String(query || "").slice(0, MAX_QUERY_LENGTH);
  const vocab = vocabularyOf(products);
  return products
    .map((p) => ({ product: p, score: scoreProduct(safeQuery, p, vocab) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ product }) => product);
};
