import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("adminToken");

export const getAllArticlesAdmin = async ({
  sortBy = "",
  sortOrder = "",
  search = "",
} = {}) => {
  try {
    const params = new URLSearchParams();
    if (sortBy) params.set("sortBy", sortBy);
    if (sortOrder) params.set("sortOrder", sortOrder);
    if (search) params.set("search", search);

    const response = await fetch(
      `${API_BASE_URL}/articles/admin?${params.toString()}`,
      { headers: { Authorization: `Bearer ${getToken()}` } },
    );

    return await response.json();
  } catch (error) {
    console.error("Get Articles Error:", error);
    return { success: false, articles: [] };
  }
};

export const getArticleByIdAdmin = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/articles/admin/${id}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Get Article Error:", error);
    return { success: false, article: null };
  }
};

export const uploadArticleImage = async (file) => {
  try {
    const formData = new FormData();
    formData.append("image", file);

    const response = await fetch(`${API_BASE_URL}/articles/upload-image`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    });

    return await response.json();
  } catch (error) {
    console.error("Upload Article Image Error:", error);
    return { success: false, message: "Unable to upload image" };
  }
};

export const addArticle = async (data) => {
  try {
    const response = await fetch(`${API_BASE_URL}/articles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(data),
    });

    return await response.json();
  } catch (error) {
    console.error("Add Article Error:", error);
    return { success: false, message: "Unable to add article" };
  }
};

export const updateArticle = async (id, data) => {
  try {
    const response = await fetch(`${API_BASE_URL}/articles/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(data),
    });

    return await response.json();
  } catch (error) {
    console.error("Update Article Error:", error);
    return { success: false, message: "Unable to update article" };
  }
};

export const deleteArticle = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/articles/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    return await response.json();
  } catch (error) {
    console.error("Delete Article Error:", error);
    return { success: false, message: "Unable to delete article" };
  }
};
