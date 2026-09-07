import API_BASE_URL from "./api";
import { cachedFetchJson } from "./requestCache";

// Same fix as getCategories in categoryService.js — this was the single
// worst offender in a real network trace: 8 duplicate /api/settings
// requests on one homepage load (Header, Footer, CartContext, TrustBar,
// WhatsAppButton, WelcomeBenefitsPopup, ... each fetch it independently).
// See requestCache.js.
export const getSiteSettings = async () => {
  try {
    const data = await cachedFetchJson("site-settings", () =>
      fetch(`${API_BASE_URL}/settings`).then((r) => r.json()),
    );

    return {
      success: data.success,
      settings: data.settings || {},
    };
  } catch (error) {
    console.error("Get Site Settings Error:", error);

    return {
      success: false,
      settings: {},
    };
  }
};
