// Lines for the printable Order Receipt, built only from the values saved
// on the order when it was placed (item prices, discounts, fees, total).
// Nothing is re-priced from current products. The payable total shown is
// always the saved order.totalPrice; the item amounts are just the saved
// price x quantity. A refund is listed separately and never subtracted
// from the order total. Zero-value lines are left out.
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const isReceiptAvailable = (order) =>
  Boolean(order) && order.orderStatus !== "Cancelled";

export const buildReceipt = (order) => {
  const items = (order?.orderItems || []).map((item) => {
    const price = num(item.price);
    const quantity = num(item.quantity);
    return { name: item.name || "", size: item.size || "", price, quantity, amount: price * quantity };
  });
  const itemsTotal = items.reduce((sum, i) => sum + i.amount, 0);

  const lines = [
    { key: "itemsTotal", amount: itemsTotal },
    { key: "coupon", amount: -num(order?.discountAmount), code: order?.couponCode || "" },
    { key: "bundle", amount: -num(order?.bundleDiscountAmount), percent: num(order?.bundleDiscountPercent) },
    { key: "points", amount: -num(order?.pointsDiscount), points: num(order?.pointsRedeemed) },
    { key: "delivery", amount: num(order?.deliveryFee) },
    { key: "cod", amount: num(order?.codCharge) },
  ].filter((l) => l.key === "itemsTotal" || l.amount !== 0);

  const total = num(order?.totalPrice);
  // The same formula createOrder used (floored at 0). A mismatch means the
  // saved breakdown can't fully explain the saved total (e.g. an old order);
  // the page still shows the saved total and says so.
  const explained = Math.max(lines.reduce((sum, l) => sum + l.amount, 0), 0);

  return {
    items,
    lines,
    total,
    refunded: num(order?.refundedAmount),
    consistent: Math.round(explained) === Math.round(total),
  };
};

// "#6A2B12E2" — the same short order reference the admin Orders page shows.
export const receiptReference = (orderId) =>
  `#${String(orderId || "").slice(-8).toUpperCase()}`;
