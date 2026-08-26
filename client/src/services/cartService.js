import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("token");

// A variant line's own _id is a composite "productId::size" string (see
// CartContext.addToCart), not a real product reference — productId always
// carries the actual Product ObjectId, with _id as a fallback for any
// non-variant line where the two are the same anyway.
const toSyncItems = (items) =>
  items.map((item) => ({
    product: item.productId || item._id,
    name: item.name,
    image: item.image,
    price: item.price,
    quantity: item.quantity,
  }));

// Fire-and-forget sync of the cart to the backend, used only to detect
// abandoned carts for the reminder email and to report product-wise cart
// counts — never read back by the UI.
export const syncCart = async (items) => {
  try {
    await fetch(`${API_BASE_URL}/cart/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ items: toSyncItems(items) }),
    });
  } catch (error) {
    console.error("Sync Cart Error:", error);
  }
};

// Same as syncCart, but for a logged-out visitor — keyed by the anonymous
// visitorId (see utils/visitorId.js) instead of a user account, so
// product-wise cart counts aren't blind to customers who never log in.
// Never used for the abandoned-cart reminder — there's no email to send.
export const syncGuestCart = async (visitorId, items) => {
  try {
    await fetch(`${API_BASE_URL}/cart/sync-guest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ visitorId, items: toSyncItems(items) }),
    });
  } catch (error) {
    console.error("Sync Guest Cart Error:", error);
  }
};
