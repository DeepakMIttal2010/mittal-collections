import API_BASE_URL from "./api";

export const getProducts = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/products`);

    if (!response.ok) {
      throw new Error("Failed to fetch products");
    }

    const data = await response.json();

    return data.products;
  } catch (error) {
    console.error("Product Service Error:", error);
    return [];
  }
};
