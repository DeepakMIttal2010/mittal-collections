import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("token");

// Fire-and-forget sync of the cart to the backend, used only to detect
// abandoned carts for the reminder email — never read back by the UI.
export const syncCart = async (items) => {
  try {
    await fetch(`${API_BASE_URL}/cart/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({
        items: items.map((item) => ({
          product: item._id,
          name: item.name,
          image: item.image,
          price: item.price,
          quantity: item.quantity,
        })),
      }),
    });
  } catch (error) {
    console.error("Sync Cart Error:", error);
  }
};
