import API_BASE_URL from "./api";

export const getTestimonials = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/testimonials`);

    const data = await response.json();

    return {
      success: data.success,
      testimonials: data.testimonials || [],
    };
  } catch (error) {
    console.error("Get Testimonials Error:", error);

    return {
      success: false,
      testimonials: [],
    };
  }
};
