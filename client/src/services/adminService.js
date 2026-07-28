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
