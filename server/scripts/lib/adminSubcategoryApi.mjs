// Small helpers for one-off scripts that read/patch subcategory fields
// through the live API. PUT /api/subcategories/:id runs through multer's
// upload.single("image") middleware (see server/routes/subcategoryRoutes.js)
// even when no file is attached, so the body must be multipart/form-data,
// not plain JSON, or multer never populates req.body.

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

// The public list endpoint already returns every field needed (no admin
// token required to read) -- only the write needs auth.
export async function getSubcategoryAdmin(base, id, _token) {
  return withRetries(async () => {
    const res = await fetch(`${base}/subcategories`);
    const data = await res.json();
    const list = data.subcategories || data.data || data;
    const sub = Array.isArray(list) ? list.find((s) => s._id === id) : null;
    if (!sub) throw new Error(`Subcategory ${id} not found in live list`);
    return sub;
  }, `getSubcategoryAdmin(${id})`);
}

export async function updateSubcategorySubtitle(base, id, subtitle, token) {
  return withRetries(async () => {
    const fd = new FormData();
    fd.append("subtitle", subtitle);

    const res = await fetch(`${base}/subcategories/${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    return { status: res.status, data };
  }, `updateSubcategorySubtitle(${id})`);
}
