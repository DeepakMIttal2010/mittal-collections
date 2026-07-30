import API_BASE_URL from "./api";

export const getStates = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/states`);

    const data = await response.json();

    return {
      success: data.success,
      states: data.states || [],
    };
  } catch (error) {
    console.error("Get States Error:", error);

    return {
      success: false,
      states: [],
    };
  }
};
