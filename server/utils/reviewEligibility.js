import mongoose from "mongoose";
import Order from "../models/Order.js";
import ReturnRequest from "../models/ReturnRequest.js";

// Two different questions, deliberately answered separately:
//
// 1. May this customer WRITE a review of this product? Yes if they bought
//    it and it was delivered to them — even if the order was later
//    cancelled after delivery (a full return) or the item was returned.
//    A customer who returned something is exactly who most needs to be
//    able to say why, so a return never takes this away.
//
// 2. May we ASK them for one (the review-request email)? Only for items
//    on an order that is still Delivered and that have no return request
//    open or completed — a returned item never gets a review request.
//
// Payment status plays no part in either: a delivered COD order is never
// marked isPaid (only the Razorpay path sets it), and an unpaid prepaid
// order is auto-cancelled long before it could reach Delivered.

// Proof that an order reached the customer. deliveredAt is written once,
// on the first Delivered transition (updateOrderStatus), and nothing ever
// clears it — so it survives a later Delivered -> Cancelled. The
// statusHistory and current-status checks cover any order whose
// deliveredAt is missing.
const DELIVERY_EVIDENCE = {
  $or: [
    { deliveredAt: { $type: "date" } },
    { "statusHistory.status": "Delivered" },
    { orderStatus: "Delivered" },
  ],
};

// Every return status except Rejected counts as returned (or on its way
// back) — the same set ReturnRequest's partial unique index treats as an
// active return. A rejected return leaves the item with the customer.
const RETURNED_STATUSES = ["Requested", "Approved", "Picked Up", "Refunded"];

const itemKey = (productId, size) => `${productId}:${size || ""}`;

const productIdOf = (product) =>
  product && typeof product === "object" && product._id ? product._id : product;

// The customer's most recent delivered order containing this product, or
// null if they never received it. Soft-deleted orders don't count — an
// admin removed that order from the books.
export const findDeliveredPurchase = async (userId, productId) =>
  Order.findOne({
    user: userId,
    "orderItems.product": new mongoose.Types.ObjectId(String(productId)),
    isActive: { $ne: false },
    ...DELIVERY_EVIDENCE,
  })
    .sort({ deliveredAt: -1, createdAt: -1 })
    .select("_id deliveredAt orderStatus");

// One query for a whole batch of orders (the review-request cron loops
// over many) -> Map of orderId -> Map of "productId:size" -> quantity
// returned. A return's quantity is clamped to the order line's quantity
// and its size copied from that line (createReturnRequest), and only one
// non-Rejected return can exist per order line (ReturnRequest's partial
// unique index) — the same per-line quantities releaseOrderResources
// relies on when restocking.
export const loadReturnedQuantities = async (orderIds) => {
  const returned = new Map();

  if (orderIds.length === 0) return returned;

  const requests = await ReturnRequest.find({
    order: { $in: orderIds },
    status: { $in: RETURNED_STATUSES },
  })
    .select("order product size quantity")
    .lean();

  for (const request of requests) {
    const orderId = String(request.order);
    if (!returned.has(orderId)) returned.set(orderId, new Map());

    const byLine = returned.get(orderId);
    const key = itemKey(request.product, request.size);
    byLine.set(key, (byLine.get(key) || 0) + (request.quantity || 0));
  }

  return returned;
};

// The items of an order we may ask a review for. Only what the customer
// kept counts: returning 1 of 2 units leaves the line eligible, returning
// both removes it. Matched on product AND size, so returning one size of a
// product leaves another size on the same order eligible.
export const getSolicitableItems = (order, returnedQuantities) => {
  if (order.orderStatus !== "Delivered" || order.isActive === false) return [];

  // Copied so allocating returned units across lines doesn't mutate the
  // shared map (a line can appear twice on one order).
  const returned = new Map(returnedQuantities.get(String(order._id)) || []);

  return (order.orderItems || []).filter((item) => {
    const productId = productIdOf(item.product);
    if (!productId) return false;

    const key = itemKey(productId, item.size);
    const ordered = item.quantity || 0;
    const back = Math.min(returned.get(key) || 0, ordered);
    returned.set(key, (returned.get(key) || 0) - back);

    return ordered - back > 0;
  });
};

// ---------------------------------------------------------------------
// 3. Does an approved review EARN its loyalty bonus? Only while the
//    customer still keeps at least one unit of the reviewed product on
//    the review's order. Same product + size matching and per-line
//    allocation as getSolicitableItems; a review has no size, so every
//    size of the product on the order counts.
// ---------------------------------------------------------------------

const OPEN_RETURN_STATUSES = ["Requested", "Approved", "Picked Up"];

// Units of productId on the order not covered by the given returns
// ({ product, size, quantity }), and how many were ordered in all.
export const countKeptUnits = (order, productId, returns) => {
  const back = new Map();

  for (const request of returns) {
    if (String(request.product) !== String(productId)) continue;
    const key = itemKey(request.product, request.size);
    back.set(key, (back.get(key) || 0) + (request.quantity || 0));
  }

  let ordered = 0;
  let kept = 0;

  for (const item of order.orderItems || []) {
    const itemProduct = productIdOf(item.product);
    if (!itemProduct || String(itemProduct) !== String(productId)) continue;

    const key = itemKey(itemProduct, item.size);
    const quantity = item.quantity || 0;
    const covered = Math.min(back.get(key) || 0, quantity);
    back.set(key, (back.get(key) || 0) - covered);

    ordered += quantity;
    kept += quantity - covered;
  }

  return { ordered, kept };
};

// { eligible: true } or { eligible: false, holdReason }. holdReason null
// means "never eligible" (an older review with no linked order); any other
// reason is a hold that may clear later (a return rejected). Pass the
// caller's session so the check reads inside its transaction.
export const getReviewBonusEligibility = async (review, session = null) => {
  if (!review.order) return { eligible: false, holdReason: null };

  const order = await Order.findById(review.order)
    .select("orderItems orderStatus isActive")
    .session(session)
    .lean();

  if (!order || order.isActive === false) return { eligible: false, holdReason: "order_deleted" };
  if (order.orderStatus === "Cancelled") return { eligible: false, holdReason: "order_cancelled" };

  const returns = await ReturnRequest.find({
    order: order._id,
    product: review.product,
    status: { $in: RETURNED_STATUSES },
  })
    .select("product size quantity status")
    .session(session)
    .lean();

  const { ordered, kept } = countKeptUnits(order, review.product, returns);

  // ordered === 0: the product isn't on the order's lines at all (older
  // data) — nothing to hold it against, so it earns as before.
  if (kept > 0 || ordered === 0) return { eligible: true };

  return {
    eligible: false,
    holdReason: returns.some((r) => OPEN_RETURN_STATUSES.includes(r.status))
      ? "return_in_progress"
      : "returned",
  };
};

// True once refunded returns cover every unit of productId on the order —
// the point at which a paid review bonus for it is taken back. Open returns
// don't count: one can still be rejected.
export const isProductFullyRefunded = async (order, productId, session = null) => {
  const refunded = await ReturnRequest.find({
    order: order._id,
    product: productId,
    status: "Refunded",
  })
    .select("product size quantity")
    .session(session)
    .lean();

  const { ordered, kept } = countKeptUnits(order, productId, refunded);
  return ordered > 0 && kept === 0;
};
