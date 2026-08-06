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
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

// Returns a match score for a query against a piece of text, or 0 if no
// reasonable match (exact substrings score highest, near-typos score lower).
const scoreText = (queryWords, text) => {
  const textWords = normalize(text);
  if (textWords.length === 0) return 0;

  const joined = textWords.join(" ");
  let score = 0;

  for (const qWord of queryWords) {
    if (joined.includes(qWord)) {
      score += qWord.length >= 3 ? 10 : 4;
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
    }
  }

  return score;
};

// Scores a product against a search query using its name (weighted higher)
// and description. Returns 0 for no match.
export const scoreProduct = (query, product) => {
  const queryWords = normalize(query);
  if (queryWords.length === 0) return 0;

  const nameScore = scoreText(queryWords, product.name) * 2;
  const descScore = scoreText(queryWords, product.description);

  return nameScore + descScore;
};

export const rankProducts = (query, products) =>
  products
    .map((p) => ({ product: p, score: scoreProduct(query, p) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ product }) => product);
