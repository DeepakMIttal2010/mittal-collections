// API base for build-time scripts, built the way services/api.js builds it
// at runtime: VITE_API_URL is the API server's origin (the production
// bundle's value is "https://mittal-collections-api.onrender.com", no
// "/api") and "/api" is appended. Using VITE_API_URL as-is requested
// .../banners instead of .../api/banners. A value that already ends in
// "/api" is accepted as-is rather than doubled.
export const apiBaseFromEnv = (value) => {
  const origin = (value || "https://mittal-collections-api.onrender.com").replace(/\/+$/, "");
  return /\/api$/.test(origin) ? origin : `${origin}/api`;
};
