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
