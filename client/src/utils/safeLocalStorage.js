// A handful of contexts/pages read JSON straight out of localStorage on
// every mount (cart, logged-in user, compare list, admin profile, recently
// viewed) with a bare JSON.parse and no try/catch. A single corrupted
// value — a partial write from a tab closing mid-save, a browser
// extension, a user poking at devtools, a future schema change writing
// something an older tab can't parse — throws during that render instead
// of just being treated as "no saved value", and for AuthContext in
// particular (which wraps most of the app), that takes down the whole
// page until someone manually clears their browser storage. Centralizing
// the read here also self-heals: a value that fails to parse is removed
// so it doesn't keep failing on every subsequent load.
export function readJsonFromStorage(key, fallback) {
  const raw = localStorage.getItem(key);

  if (!raw) return fallback;

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Corrupted localStorage value for "${key}", clearing it:`, error);
    localStorage.removeItem(key);
    return fallback;
  }
}
