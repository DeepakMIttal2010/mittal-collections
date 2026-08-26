import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("adminToken");

export const getDashboardData = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/dashboard`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    const data = await response.json();

    return data;
  } catch (error) {
    console.error("Dashboard Error:", error);

    return {
      success: false,
    };
  }
};

export const getReportsData = async ({ days, startDate, endDate } = {}) => {
  try {
    const params =
      startDate && endDate
        ? `startDate=${startDate}&endDate=${endDate}`
        : `days=${days || 30}`;

    const response = await fetch(`${API_BASE_URL}/admin/reports?${params}`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    const data = await response.json();

    return data;
  } catch (error) {
    console.error("Reports Error:", error);

    return {
      success: false,
    };
  }
};

export const getProductEngagement = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/product-engagement`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    const data = await response.json();

    return data;
  } catch (error) {
    console.error("Product Engagement Error:", error);

    return {
      success: false,
    };
  }
};

export const getProductWishlistUsers = async (productId) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/admin/product-engagement/${productId}/wishlist-users`,
      {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      },
    );

    return await response.json();
  } catch (error) {
    console.error("Product Wishlist Users Error:", error);

    return {
      success: false,
    };
  }
};

export const getProductCartUsers = async (productId) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/admin/product-engagement/${productId}/cart-users`,
      {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      },
    );

    return await response.json();
  } catch (error) {
    console.error("Product Cart Users Error:", error);

    return {
      success: false,
    };
  }
};

export const getProductViewUsers = async (productId) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/admin/product-engagement/${productId}/view-users`,
      {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      },
    );

    return await response.json();
  } catch (error) {
    console.error("Product View Users Error:", error);

    return {
      success: false,
    };
  }
};

export const getEngagementDetails = async () => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/admin/product-engagement/details`,
      {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      },
    );

    return await response.json();
  } catch (error) {
    console.error("Engagement Details Error:", error);

    return {
      success: false,
    };
  }
};

export const getAbandonedCartDetails = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/abandoned-carts`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error("Abandoned Cart Details Error:", error);

    return {
      success: false,
    };
  }
};

export const getGoogleReportsData = async (days = 28) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/admin/reports/google?days=${days}`,
      {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      },
    );

    const data = await response.json();

    return data;
  } catch (error) {
    console.error("Google Reports Error:", error);

    return {
      success: false,
    };
  }
};
