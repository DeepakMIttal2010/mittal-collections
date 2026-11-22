import Order from "../models/Order.js";
import OfflineSale from "../models/OfflineSale.js";
import ReturnRequest from "../models/ReturnRequest.js";
import {
  orderIsSold,
  shipDateOf,
  orderSaleAmounts,
  returnRefundPaise,
  refundDateOf,
} from "./accountingPosting.js";
import { toIstDateString } from "./recurringExpenses.js";

// Admin revenue (Dashboard + Reports) on the SAME basis as the books
// (admin audit RP-01). Every rule comes from accountingPosting.js; nothing
// is re-implemented here:
//   - online order: counts once sold (Shipped/Delivered, not soft-deleted),
//     on its ship date, whatever the payment method (owner D3);
//   - refund: taken off on its refund date, only while the order still
//     counts as sold (owner D1);
//   - POS sale: counts on its sale date unless voided.
//
//   totalRevenue = onlineSales + deliveryCodIncome - onlineDiscounts
//                + posSales - posDiscounts - refunds
//
// which is, ledger by ledger: sales-online + delivery-income + sales-pos
// - discount - sales-returns. All sums are in paise; rupees only at the end.

const SOLD_STATUSES = ["Shipped", "Delivered"];

const inRange = (date, since, until) => (!since || date >= since) && (!until || date <= until);

const rupees = (p) => p / 100;

// `since`/`until` are IST day bounds; omit both for all-time.
export const computeRevenue = async ({ since = null, until = null } = {}) => {
  // Pre-filter only: a ship date on/after `since` needs some history entry
  // (or the updatedAt fallback) on/after it. The exact ship date is then
  // decided by shipDateOf below.
  const orderFilter = { isActive: { $ne: false }, orderStatus: { $in: SOLD_STATUSES } };
  if (since) orderFilter.$or = [{ "statusHistory.changedAt": { $gte: since } }, { updatedAt: { $gte: since } }];

  const refundFilter = { status: "Refunded" };
  if (since || until) {
    const span = { ...(since && { $gte: since }), ...(until && { $lte: until }) };
    refundFilter.$or = [{ refundedAt: span }, { refundedAt: null, updatedAt: span }];
  }

  const posFilter = { voided: { $ne: true } };
  if (since || until) posFilter.createdAt = { ...(since && { $gte: since }), ...(until && { $lte: until }) };

  const [candidates, refundedReturns, posSalesAgg] = await Promise.all([
    Order.find(orderFilter)
      .select("orderStatus isActive statusHistory updatedAt totalPrice deliveryFee codCharge discountAmount bundleDiscountAmount pointsDiscount")
      .lean(),
    ReturnRequest.find(refundFilter).select("order product size quantity status refundedAt updatedAt").lean(),
    OfflineSale.aggregate([
      { $match: posFilter },
      {
        $group: {
          _id: null,
          // Per-sale paise, as the books round each voucher.
          total: { $sum: { $round: [{ $multiply: [{ $ifNull: ["$totalAmount", 0] }, 100] }, 0] } },
          discount: { $sum: { $round: [{ $multiply: [{ $ifNull: ["$discountAmount", 0] }, 100] }, 0] } },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  let onlineSales = 0;
  let deliveryCodIncome = 0;
  let onlineDiscounts = 0;
  const soldOrderIds = [];
  const byDay = new Map();

  for (const order of candidates) {
    if (!orderIsSold(order)) continue;
    const shipped = shipDateOf(order);
    if (!shipped || !inRange(shipped, since, until)) continue;

    soldOrderIds.push(order._id);
    const amounts = orderSaleAmounts(order);
    if (!amounts) continue;

    onlineSales += amounts.sales;
    deliveryCodIncome += amounts.delivery;
    onlineDiscounts += amounts.discounts;

    // Daily chart: what the customer paid, on the ship day; refunds are
    // deliberately NOT netted here (owner decision) -- they come off the
    // period total on their own refund date.
    const day = toIstDateString(shipped);
    const bucket = byDay.get(day) || { revenue: 0, orders: 0 };
    bucket.revenue += amounts.sales + amounts.delivery - amounts.discounts;
    bucket.orders += 1;
    byDay.set(day, bucket);
  }

  // A refund needs its order's lines and discounts to value it the way the
  // books do (returnedValueFor via returnRefundPaise).
  let refunds = 0;
  const refundOrderIds = [...new Set(refundedReturns.map((rr) => String(rr.order)))];
  if (refundOrderIds.length) {
    const refundOrders = await Order.find({ _id: { $in: refundOrderIds } })
      .select("orderStatus isActive orderItems discountAmount bundleDiscountAmount pointsDiscount")
      .lean();
    const orderById = new Map(refundOrders.map((o) => [String(o._id), o]));

    for (const rr of refundedReturns) {
      if (!inRange(refundDateOf(rr), since, until)) continue;
      const amount = returnRefundPaise(rr, orderById.get(String(rr.order)) || null);
      // null: nothing posted; undefined: ambiguous line -- the books leave
      // it unposted too, so it is not taken off here either.
      if (amount) refunds += amount;
    }
  }

  const posTotal = posSalesAgg[0]?.total || 0;
  const posDiscounts = posSalesAgg[0]?.discount || 0;
  const posSales = posTotal + posDiscounts;

  const totalPaise = onlineSales + deliveryCodIncome - onlineDiscounts + posSales - posDiscounts - refunds;

  return {
    totalRevenue: rupees(totalPaise),
    posRevenue: rupees(posTotal),
    posCount: posSalesAgg[0]?.count || 0,
    soldOrderIds,
    breakdown: {
      onlineSales: rupees(onlineSales),
      deliveryCodIncome: rupees(deliveryCodIncome),
      onlineDiscounts: rupees(onlineDiscounts),
      posSales: rupees(posSales),
      posDiscounts: rupees(posDiscounts),
      refunds: rupees(refunds),
    },
    salesByDay: [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([day, v]) => ({ _id: day, revenue: rupees(v.revenue), orders: v.orders })),
  };
};
