import API_BASE_URL from "./api";

export const getPriceRanges = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/price-ranges`);

    const data = await response.json();

    return { success: true, priceRanges: data.priceRanges || [] };
  } catch (error) {
    console.error("Get Price Ranges Error:", error);
    return { success: false, priceRanges: [] };
  }
};
