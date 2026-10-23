// Small-catalog fuzzy text matching — no external search service needed.
// Computes Levenshtein edit distance so short typos ("curtan" -> "curtain")
// still match, and scores results so closer matches rank first.

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

// One group per word the shopper typed: the word itself plus any catalog
// word(s) it maps to. Scoring uses every word in every group; the
// "enough of the query matched" rule in scoreProduct counts GROUPS, so a
// synonym that expands to three catalog words doesn't make a one-word
// search suddenly need two matches.
const synonymGroups = (words) => words.map((word) => [word, ...(HINDI_TO_ENGLISH.get(word) || [])]);

// Returns a match score for a query against a piece of text (0 if no
// reasonable match — exact substrings score highest, near-typos score
// lower) AND which specific query words actually matched, so the caller
// can require real coverage across a multi-word query rather than just
// "at least one word matched somewhere" (see scoreProduct's comment).
const scoreText = (queryWords, text, wholeWordOnly = new Set()) => {
  const textWords = normalize(text);
  const matchedWords = new Set();
  if (textWords.length === 0) return { score: 0, matchedWords };

  const joined = textWords.join(" ");
  let score = 0;

  for (const qWord of queryWords) {
    // A known Hinglish word and the catalog words it maps to: we already
    // know what the shopper meant, so match whole words only (plural
    // allowed). Typo tolerance and substring matching made "dohar" match
    // "door"(mat), "toy" match "top" and "table" match "comfortable".
    if (wholeWordOnly.has(qWord)) {
      if (textWords.some((t) => t === qWord || t === `${qWord}s` || t === `${qWord}es`)) {
        score += 10;
        matchedWords.add(qWord);
      }
      continue;
    }

    if (joined.includes(qWord)) {
      score += qWord.length >= 3 ? 10 : 4;
      matchedWords.add(qWord);
      continue;
    }

    let bestDistance = Infinity;
    for (const tWord of textWords) {
      const distance = levenshtein(qWord, tWord);
      if (distance < bestDistance) bestDistance = distance;
    }

    const tolerance = qWord.length <= 4 ? 1 : 2;
    if (bestDistance <= tolerance) {
      score += Math.max(1, 6 - bestDistance);
      matchedWords.add(qWord);
    }
  }

  return { score, matchedWords };
};

// Scores a product against a search query using its name (weighted higher)
// and description. Returns 0 for no match.
export const scoreProduct = (query, product) => {
  const groups = synonymGroups(normalize(query));
  if (groups.length === 0) return 0;
  const queryWords = [...new Set(groups.flat())];

  const wholeWordOnly = new Set(groups.filter((group) => group.length > 1).flat());
  const nameResult = scoreText(queryWords, product.name, wholeWordOnly);
  const descResult = scoreText(queryWords, product.description, wholeWordOnly);

  // Requires a real fraction of the query's own words to actually be
  // present (exact or typo-tolerant) somewhere on the product -- not
  // just that at least ONE word happened to overlap somewhere in a long
  // description. Before this, a specific multi-word product-name search
  // (e.g. "Veeba White Lilly Reversible Microfibre Comforter") returned
  // the ENTIRE catalog (confirmed live, 2026-10-13: 162/162 products),
  // just reordered -- any product whose description happened to contain
  // one common word like "white" anywhere scored > 0 and was included,
  // and SearchResults.jsx has no result cap/pagination, so a customer
  // scrolling down would eventually see totally unrelated products
  // (doormats, towels) "matching" their search. ceil(n/2) leaves
  // single/two-word queries (the typical real search, and the actual
  // case the typo-tolerance exists for) needing only one real match,
  // same as before -- it only tightens longer, more specific queries.
  const matchedWords = new Set([...nameResult.matchedWords, ...descResult.matchedWords]);
  const matchedGroups = groups.filter((group) => group.some((word) => matchedWords.has(word))).length;
  const requiredMatches = Math.ceil(groups.length / 2);
  if (matchedGroups < requiredMatches) return 0;

  return nameResult.score * 2 + descResult.score;
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
  return products
    .map((p) => ({ product: p, score: scoreProduct(safeQuery, p) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ product }) => product);
};
