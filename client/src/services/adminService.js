import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("token");

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

export const getReportsData = async (days = 30) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/admin/reports?days=${days}`,
      {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      },
    );

    const data = await response.json();

    return data;
  } catch (error) {
    console.error("Reports Error:", error);

    return {
      success: false,
    };
  }
};

export const getVisitLog = async ({ days = 30, page = 1, limit = 25 } = {}) => {
  try {
    const params = new URLSearchParams({ days, page, limit });

    const response = await fetch(`${API_BASE_URL}/admin/visits?${params}`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    const data = await response.json();

    return data;
  } catch (error) {
    console.error("Visit Log Error:", error);

    return {
      success: false,
    };
  }
};
