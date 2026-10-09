// Small helpers for one-off scripts that read/patch article content
// through the live API. updateArticle (see server/controllers/
// articleController.js) only applies fields actually present in the
// request body, so a caller here only needs to send the field(s) it's
// actually changing (content/contentHi), not a full-document overwrite
// like adminProductApi.mjs's updateProduct requires.

const RETRYABLE_DELAY_MS = 5000;
const MAX_RETRIES = 5;

async function withRetries(fn, label) {
  let lastErr;
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      console.log(`${label} attempt ${i + 1} error:`, e.message);
      await new Promise((r) => setTimeout(r, RETRYABLE_DELAY_MS));
    }
  }
  throw lastErr ?? new Error(`${label} failed after ${MAX_RETRIES} retries`);
}

// The public slug endpoint already returns the full article document
// (content/contentHi included, confirmed via server/controllers/
// articleController.js's getArticleBySlug) -- no admin token needed to
// read, only to write via updateArticle below.
export async function getArticleAdmin(base, slug, _token) {
  return withRetries(async () => {
    const res = await fetch(`${base}/articles/slug/${slug}`);
    const data = await res.json();
    if (!data.success) throw new Error(`Fetch failed for ${slug}: ` + JSON.stringify(data));
    return data.article;
  }, `getArticleAdmin(${slug})`);
}

export async function updateArticleContent(base, id, fields, token) {
  return withRetries(async () => {
    const res = await fetch(`${base}/articles/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(fields),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    return { status: res.status, data };
  }, `updateArticleContent(${id})`);
}
