// Plain localStorage helpers for the in-shop POS cart — deliberately
// not a React context, since items get added one scan at a time via
// full page navigations (the QR code always links to /admin/pos/:id),
// so there's no single mounted component to hold state in memory
// across scans. Mirrors the shape of the customer-facing cart
// (context/CartContext.jsx) closely enough to stay familiar.

const STORAGE_KEY = "posCartItems";

// A variant product's two different sizes need to sit in the cart as
// separate lines (same as the customer-facing cart), so items are keyed
// by product id + size together, not just product id.
const lineKey = (productId, size) => `${productId}::${size || ""}`;

export const getPosCart = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? JSON.parse(saved) : [];
};

const savePosCart = (items) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

// Adds a scanned product (optionally a specific size variant) to the
// cart, or increments its quantity by 1 if that exact product+size is
// already in there. `variant`, when given, is the specific entry from
// product.variants the staff picked a size for — its own price/stock
// are used instead of the product's top-level price/stock, same as the
// customer-facing size selector.
export const addToPosCart = (product, variant = null) => {
  const items = getPosCart();
  const size = variant?.size || "";
  const key = lineKey(product._id, size);
  const existing = items.find(
    (item) => lineKey(item.productId, item.size) === key,
  );
  const maxStock = variant ? variant.stock : product.stock;

  let updated;
  if (existing) {
    updated = items.map((item) =>
      lineKey(item.productId, item.size) === key
        ? { ...item, quantity: Math.min(item.quantity + 1, maxStock) }
        : item,
    );
  } else {
    updated = [
      ...items,
      {
        productId: product._id,
        name: product.name,
        image: product.image,
        size,
        unitPrice: variant ? variant.price : product.price,
        quantity: 1,
        maxStock,
      },
    ];
  }

  savePosCart(updated);
  return updated;
};

export const updatePosCartQuantity = (productId, size, quantity) => {
  const key = lineKey(productId, size);
  const items = getPosCart().map((item) =>
    lineKey(item.productId, item.size) === key
      ? { ...item, quantity: Math.max(1, Math.min(quantity, item.maxStock)) }
      : item,
  );

  savePosCart(items);
  return items;
};

export const updatePosCartPrice = (productId, size, unitPrice) => {
  const key = lineKey(productId, size);
  const items = getPosCart().map((item) =>
    lineKey(item.productId, item.size) === key ? { ...item, unitPrice } : item,
  );

  savePosCart(items);
  return items;
};

export const removeFromPosCart = (productId, size) => {
  const key = lineKey(productId, size);
  const items = getPosCart().filter(
    (item) => lineKey(item.productId, item.size) !== key,
  );
  savePosCart(items);
  return items;
};

export const clearPosCart = () => {
  localStorage.removeItem(STORAGE_KEY);
};
