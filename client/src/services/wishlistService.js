import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("token");

// GET Wishlist
export const getWishlist = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/wishlist`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch wishlist");
    }

    const data = await response.json();

    return data.wishlist;
  } catch (error) {
    console.error(error);
    return [];
  }
};

// ADD to Wishlist
export const addToWishlist = async (productId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/wishlist`, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },

      body: JSON.stringify({
        productId,
      }),
    });

    return await response.json();
  } catch (error) {
    console.error(error);
  }
};

// REMOVE from Wishlist
export const removeFromWishlist = async (productId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/wishlist/${productId}`, {
      method: "DELETE",

      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error(error);
  }
};

export const clearWishlist = async () => {
  const response = await fetch(`${API_BASE_URL}/wishlist`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  });

  return await response.json();
};
