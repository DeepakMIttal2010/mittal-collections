import API_BASE_URL from "./api";

export const recordVisit = async (path, visitorId) => {
  try {
    await fetch(`${API_BASE_URL}/analytics/visit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, visitorId }),
    });
  } catch {
    // best-effort, tracking should never break the page
  }
};
