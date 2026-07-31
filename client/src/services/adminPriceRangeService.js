import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("token");

export const getAllPriceRangesAdmin = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/price-ranges/admin`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    const data = await response.json();

    return { success: true, priceRanges: data.priceRanges || [] };
  } catch (error) {
    console.error("Get Price Ranges Error:", error);
    return { success: false, priceRanges: [], message: "Unable to fetch" };
  }
};

export const addPriceRange = async (payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/price-ranges`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });

    return await response.json();
  } catch (error) {
    console.error("Add Price Range Error:", error);
    return { success: false, message: "Unable to add price range" };
  }
};

export const updatePriceRange = async (id, payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/price-ranges/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });

    return await response.json();
  } catch (error) {
    console.error("Update Price Range Error:", error);
    return { success: false, message: "Unable to update price range" };
  }
};

export const restorePriceRange = async (id) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/price-ranges/${id}/restore`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${getToken()}` },
      },
    );

    return await response.json();
  } catch (error) {
    console.error("Restore Price Range Error:", error);
    return { success: false, message: "Unable to restore price range" };
  }
};

export const deletePriceRange = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/price-ranges/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Delete Price Range Error:", error);
    return { success: false, message: "Unable to delete price range" };
  }
};
