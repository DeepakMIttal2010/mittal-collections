// Plain localStorage helpers for the in-shop POS cart — deliberately
// not a React context, since items get added one scan at a time via
// full page navigations (the QR code always links to /admin/pos/:id),
// so there's no single mounted component to hold state in memory
// across scans. Mirrors the shape of the customer-facing cart
// (context/CartContext.jsx) closely enough to stay familiar.

const STORAGE_KEY = "posCartItems";

export const getPosCart = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? JSON.parse(saved) : [];
};

const savePosCart = (items) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

// Adds a scanned product to the cart, or increments its quantity by 1
// if it's already in there. Returns the updated cart.
export const addToPosCart = (product) => {
  const items = getPosCart();
  const existing = items.find((item) => item.productId === product._id);

  let updated;
  if (existing) {
    updated = items.map((item) =>
      item.productId === product._id
        ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) }
        : item,
    );
  } else {
    updated = [
      ...items,
      {
        productId: product._id,
        name: product.name,
        image: product.image,
        unitPrice: product.price,
        quantity: 1,
        maxStock: product.stock,
      },
    ];
  }

  savePosCart(updated);
  return updated;
};

export const updatePosCartQuantity = (productId, quantity) => {
  const items = getPosCart().map((item) =>
    item.productId === productId
      ? { ...item, quantity: Math.max(1, Math.min(quantity, item.maxStock)) }
      : item,
  );

  savePosCart(items);
  return items;
};

export const updatePosCartPrice = (productId, unitPrice) => {
  const items = getPosCart().map((item) =>
    item.productId === productId ? { ...item, unitPrice } : item,
  );

  savePosCart(items);
  return items;
};

export const removeFromPosCart = (productId) => {
  const items = getPosCart().filter((item) => item.productId !== productId);
  savePosCart(items);
  return items;
};

export const clearPosCart = () => {
  localStorage.removeItem(STORAGE_KEY);
};
