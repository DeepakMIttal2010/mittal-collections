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

// startDate/endDate (YYYY-MM-DD) are optional — omit both for the
// default all-time view. Only scopes the Views column; wishlist/cart
// counts are always current-state, never date-filtered (see the
// backend's own comment on why).
export const getProductEngagement = async (startDate, endDate) => {
  try {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);

    const response = await fetch(
      `${API_BASE_URL}/admin/product-engagement?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      },
    );

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

export const getProductViewUsers = async (productId, startDate, endDate) => {
  try {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);

    const response = await fetch(
      `${API_BASE_URL}/admin/product-engagement/${productId}/view-users?${params.toString()}`,
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

// Backs the "View Details" drill-down on the Website Visits/Unique/New/
// Returning Visitors tiles — raw PageVisit rows so an admin can verify
// what's actually behind those numbers, not just trust the aggregate.
export const getVisitLog = async ({
  days,
  startDate,
  endDate,
  page = 1,
  limit = 25,
  q = "",
  view = "all",
} = {}) => {
  try {
    const params = new URLSearchParams({ page, limit, view });
    if (startDate && endDate) {
      params.set("startDate", startDate);
      params.set("endDate", endDate);
    } else if (days) {
      params.set("days", days);
    }
    if (q) params.set("q", q);

    const response = await fetch(`${API_BASE_URL}/admin/visits?${params}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Get Visit Log Error:", error);

    return { success: false };
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
