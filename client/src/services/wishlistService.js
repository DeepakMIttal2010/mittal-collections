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

// Guest (logged-out) wishlist — same shape as the logged-in functions
// above, keyed by the anonymous visitorId instead of a token.
export const getGuestWishlist = async (visitorId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/wishlist/guest/${visitorId}`, {
      cache: "no-store",
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

export const addToGuestWishlist = async (visitorId, productId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/wishlist/guest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId, productId }),
    });

    return await response.json();
  } catch (error) {
    console.error(error);
  }
};

export const removeFromGuestWishlist = async (visitorId, productId) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/wishlist/guest/${visitorId}/${productId}`,
      { method: "DELETE" },
    );

    return await response.json();
  } catch (error) {
    console.error(error);
  }
};

export const clearGuestWishlist = async (visitorId) => {
  const response = await fetch(`${API_BASE_URL}/wishlist/guest/${visitorId}`, {
    method: "DELETE",
  });

  return await response.json();
};

// Called once right after login to fold whatever the customer wishlisted
// while logged out into their account.
export const mergeGuestWishlist = async (visitorId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/wishlist/merge-guest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ visitorId }),
    });

    return await response.json();
  } catch (error) {
    console.error(error);
    return { success: false };
  }
};
