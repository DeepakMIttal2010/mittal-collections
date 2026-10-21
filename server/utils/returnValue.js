// Value refunded for a returned line: the item's price x quantity, net of
// its share of whatever discount applied to the WHOLE order.
//
// Prorating matters: using the raw, undiscounted item price overstated
// refundedAmount (and so understated revenue, since every aggregation
// subtracts it) on any order that had a coupon/bundle/points discount. A
// Rs 500 item on an order with a 10% overall discount actually cost the
// customer ~Rs 450; refunding Rs 500 counted Rs 50 more than was ever
// collected (deep bug sweep, 2026-10-20).
//
// Single source of truth: returnController increments Order.refundedAmount
// with this, and the accounting module posts the very same figure to the
// books, so the two can never disagree.
export const returnedValueFor = (order, orderItem, quantity) => {
  const rawItemValue = orderItem.price * quantity;

  const orderSubtotal = order.orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalDiscount =
    (order.discountAmount || 0) + (order.bundleDiscountAmount || 0) + (order.pointsDiscount || 0);
  const discountRatio =
    orderSubtotal > 0 ? Math.min(1, Math.max(0, totalDiscount / orderSubtotal)) : 0;

  return rawItemValue * (1 - discountRatio);
};
