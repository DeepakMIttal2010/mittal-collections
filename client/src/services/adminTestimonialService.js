import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("adminToken");

export const getAllTestimonialsAdmin = async ({
  sortBy = "",
  sortOrder = "",
} = {}) => {
  try {
    const params = new URLSearchParams();
    if (sortBy) params.set("sortBy", sortBy);
    if (sortOrder) params.set("sortOrder", sortOrder);

    const response = await fetch(
      `${API_BASE_URL}/testimonials/admin?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${getToken()}` },
      },
    );

    const data = await response.json();

    return { success: true, testimonials: data.testimonials || [] };
  } catch (error) {
    console.error("Get Testimonials Error:", error);
    return { success: false, testimonials: [], message: "Unable to fetch" };
  }
};

export const addTestimonial = async (payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/testimonials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });

    return await response.json();
  } catch (error) {
    console.error("Add Testimonial Error:", error);
    return { success: false, message: "Unable to add testimonial" };
  }
};

export const updateTestimonial = async (id, payload) => {
  try {
    const response = await fetch(`${API_BASE_URL}/testimonials/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });

    return await response.json();
  } catch (error) {
    console.error("Update Testimonial Error:", error);
    return { success: false, message: "Unable to update testimonial" };
  }
};

export const deleteTestimonial = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/testimonials/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Delete Testimonial Error:", error);
    return { success: false, message: "Unable to delete testimonial" };
  }
};
