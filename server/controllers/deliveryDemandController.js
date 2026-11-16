import mongoose from "mongoose";

import DeliveryDemand from "../models/DeliveryDemand.js";
import DeliveryDemandIpDay from "../models/DeliveryDemandIpDay.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import { checkDeliveryEligibility } from "../utils/deliveryEligibility.js";
import { istDayEnd, istDayStart, istTodayString, istDaysAgoString } from "../utils/istDate.js";
import { isDatacenterIp } from "../utils/isDatacenterIp.js";
import { hashClientIp, hashVisitorId } from "../utils/deliveryDemandKey.js";
import { isBotUserAgent } from "./analyticsController.js";

// PR-B2 Delivery Demand: measures how many shoppers check PINs we can't
// deliver to yet (outside UP today), to inform the GST-registration
// decision. Recording never changes what the customer sees and never
// touches delivery eligibility, checkout or payment — the existing
// GET /api/delivery/check-pincode and createOrder are unchanged.

const SOURCES = ["product", "header", "checkout"];
const VISITOR_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
// Review fix H2: a cart beyond these limits (or worth more than
// OUTLIER_CART_VALUE) is kept but marked as an outlier, and outlier carts
// are left out of the main Potential Value / Estimated Margin totals.
const MAX_CART_LINES = 20;
const MAX_LINE_QUANTITY = 10;
const OUTLIER_CART_VALUE = 50000;
// Review fix H1: new guest browsers accepted per network (IP) per IST day.
const GUEST_VISITORS_PER_IP_PER_DAY = 5;
const REPORT_MAX_DAYS = 365;
const REPORT_ROW_CAP = 500;
const REPORT_DOC_CAP = 50000;
const HOME_STATE = "uttar pradesh";

const isObjectIdString = (value) =>
  typeof value === "string" && mongoose.Types.ObjectId.isValid(value) && /^[a-f\d]{24}$/i.test(value);

const roundMoney = (value) => Math.round(value * 100) / 100;

const emptyCart = () => ({ items: [], cartValue: 0, cartCost: 0, costIncomplete: false, outlier: false, outlierReasons: [] });

// Same price rule as createOrder's verifyOrderItems (active, not
// offline-only; a sized product needs a valid size) but without the
// stock check, and malformed lines are skipped instead of failing — this
// only estimates demand. Prices and costs always come from the database;
// only product, size and quantity come from the browser. Duplicate
// product+size lines are merged. A quantity above MAX_LINE_QUANTITY is
// capped, lines past MAX_CART_LINES are dropped, and either makes the
// cart an outlier (as does a value above OUTLIER_CART_VALUE) — the cart
// is still recorded, never silently discarded.
export const priceDemandItems = async (rawItems) => {
  if (!Array.isArray(rawItems)) return emptyCart();

  const merged = new Map();

  // A bound on the work done for one request, far above any real cart.
  for (const raw of rawItems.slice(0, 200)) {
    if (!raw || typeof raw !== "object" || !isObjectIdString(raw.product)) continue;

    const quantity = Number(raw.quantity);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) continue;

    const size = typeof raw.size === "string" ? raw.size.trim().slice(0, 40) : "";
    const key = `${raw.product}|${size}`;
    const existing = merged.get(key);

    merged.set(key, { product: raw.product, size, quantity: (existing?.quantity || 0) + quantity });
  }

  const outlierReasons = [];
  let lines = [...merged.values()];
  if (lines.length === 0) return emptyCart();

  if (lines.length > MAX_CART_LINES) {
    outlierReasons.push(`more than ${MAX_CART_LINES} product lines (${lines.length}); only the first ${MAX_CART_LINES} kept`);
    lines = lines.slice(0, MAX_CART_LINES);
  }

  if (lines.some((line) => line.quantity > MAX_LINE_QUANTITY)) {
    outlierReasons.push(`quantity above ${MAX_LINE_QUANTITY} on a line (capped at ${MAX_LINE_QUANTITY})`);
    lines = lines.map((line) => ({ ...line, quantity: Math.min(MAX_LINE_QUANTITY, line.quantity) }));
  }

  const products = await Product.find({
    // Rebuilt as ObjectIds right at the query (CodeQL wants the
    // sanitising step in the same function as the query).
    _id: { $in: [...new Set(lines.map((line) => line.product))].map((id) => new mongoose.Types.ObjectId(id)) },
    isActive: true,
    visibility: { $ne: "offline" },
  })
    .select("name price purchasePrice miscExpenses variants")
    .lean();
  const byId = new Map(products.map((product) => [String(product._id), product]));

  const items = [];
  let costIncomplete = false;

  for (const line of lines) {
    const product = byId.get(line.product);
    if (!product) continue;

    let price;
    let purchasePrice;

    if (line.size) {
      const variant = product.variants?.find((v) => v.size === line.size);
      if (!variant) continue;
      price = variant.price;
      purchasePrice = variant.purchasePrice || 0;
    } else if (product.variants?.length > 0) {
      continue;
    } else {
      price = product.price;
      purchasePrice = product.purchasePrice || 0;
    }

    if (!(purchasePrice > 0)) costIncomplete = true;

    items.push({
      product: product._id,
      name: product.name,
      size: line.size,
      quantity: line.quantity,
      unitPrice: price,
      unitCost: purchasePrice > 0 ? purchasePrice + (product.miscExpenses || 0) : 0,
    });
  }

  const cartValue = roundMoney(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  const cartCost = roundMoney(items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0));

  if (cartValue > OUTLIER_CART_VALUE) {
    outlierReasons.push(`cart value above ₹${OUTLIER_CART_VALUE.toLocaleString("en-IN")}`);
  }

  return { items, cartValue, cartCost, costIncomplete, outlier: outlierReasons.length > 0, outlierReasons };
};

// Review fix H1: claims one of the day's guest slots for this network.
// Atomic: the filter only matches when the visitor is already listed or
// the list still has room, so concurrent first requests can't overshoot
// the cap; a lost upsert race (duplicate key) is retried as a plain
// update. Returns false when the cap is full — the refused check is then
// counted in limitedAttempts, never as demand.
export const claimGuestSlot = async ({ ipHash, day, visitorKey }) => {
  const filter = {
    ipHash,
    day,
    $or: [{ visitors: visitorKey }, { [`visitors.${GUEST_VISITORS_PER_IP_PER_DAY - 1}`]: { $exists: false } }],
  };
  const update = { $addToSet: { visitors: visitorKey }, $setOnInsert: { createdAt: new Date() } };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const doc = await DeliveryDemandIpDay.findOneAndUpdate(filter, update, { upsert: attempt === 0, returnDocument: "after" });
      if (doc) return true;
      break;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }

  await DeliveryDemandIpDay.updateOne({ ipHash, day }, { $inc: { limitedAttempts: 1 } });
  return false;
};

// ============================
// Record a delivery-demand signal (Public, optional auth)
// ============================
// Always answers 202 for well-formed input, whether or not a row was
// written, so the endpoint can't be used to probe anything.
export const recordDeliveryDemand = async (req, res) => {
  const accepted = () => res.status(202).json({ success: true });

  try {
    const { pincode, source, productId, visitorId, items } = req.body || {};

    if (typeof pincode !== "string" || !/^\d{6}$/.test(pincode) || !SOURCES.includes(source)) {
      return res.status(400).json({ success: false, message: "Invalid request" });
    }
    if (productId !== undefined && productId !== null && !isObjectIdString(productId)) {
      return res.status(400).json({ success: false, message: "Invalid request" });
    }
    if (visitorId !== undefined && visitorId !== null && (typeof visitorId !== "string" || !VISITOR_ID_PATTERN.test(visitorId))) {
      return res.status(400).json({ success: false, message: "Invalid request" });
    }

    const user = req.user;

    // The owner's and staff's own checks, bots and cloud machines are
    // not shopper demand.
    if (user?.role === "admin") return accepted();
    if (isBotUserAgent(req.headers["user-agent"])) return accepted();
    // req.ip, not the raw X-Forwarded-For header: with app.js's
    // "trust proxy" 2, Express takes the address our two known proxy hops
    // saw, and ignores anything a client wrote further down the header.
    const clientIp = req.ip || "";
    if (await isDatacenterIp(clientIp)) return accepted();

    // Checkout rows carry a cart and an identity, so they need a real
    // signed-in customer; guests count through product/header checks.
    if (source === "checkout" && !user) return accepted();
    if (!user && !visitorId) return accepted();

    // Cache only: the shopper's own GET check-pincode call has just
    // verified and cached this PIN, so no second India Post call is made,
    // and the state always comes from our cache, never from the client.
    const delivery = await checkDeliveryEligibility(pincode, { cacheOnly: true });
    if (delivery.eligible || delivery.reason === "invalid") return accepted();

    const now = new Date();
    const day = istTodayString();
    const visitorKey = user ? `u:${user._id}` : `v:${hashVisitorId(visitorId)}`;

    // Guests only: a signed-in customer is already one account. A
    // browser already accepted today keeps recording its repeat checks.
    if (!user && !(await claimGuestSlot({ ipHash: hashClientIp(clientIp, day), day, visitorKey }))) {
      return accepted();
    }

    let product = null;
    if (source === "product" && productId) {
      product = await Product.findOne({ _id: new mongoose.Types.ObjectId(productId), isActive: true, visibility: { $ne: "offline" } })
        .select("name category")
        .lean();
    }

    // Only plain strings / our own constants reach the query.
    const filter = {
      visitorKey: { $eq: String(visitorKey) },
      pincode: { $eq: String(pincode) },
      day: { $eq: String(day) },
      source: SOURCES.find((known) => known === source),
      product: product?._id || null,
    };

    const update = {
      $setOnInsert: {
        firstAt: now,
        user: user?._id || null,
        productName: product?.name || "",
        category: product?.category || null,
      },
      $set: {
        lastAt: now,
        state: delivery.state || "",
        district: delivery.district || "",
        reason: delivery.reason,
      },
      $inc: { attempts: 1 },
    };

    if (source === "checkout") {
      const priced = await priceDemandItems(items);
      Object.assign(update.$set, priced);
    }

    try {
      await DeliveryDemand.updateOne(filter, update, { upsert: true });
    } catch (error) {
      // Two simultaneous first checks race on the unique index; the
      // loser simply updates the row the winner created.
      if (error?.code !== 11000) throw error;
      delete update.$setOnInsert;
      await DeliveryDemand.updateOne(filter, update);
    }

    return accepted();
  } catch (error) {
    console.error("Record Delivery Demand Error:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ============================
// Report helpers
// ============================
const isDateString = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const cleanText = (value) => (typeof value === "string" ? value.trim().slice(0, 80) : "");
const sameText = (a, b) => (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();

export const REASON_LABELS = {
  not_serviceable: "State restricted (outside delivery area)",
  unverified: "PIN not verified (India Post unavailable)",
  ambiguous: "PIN spans more than one state",
};

export const SOURCE_LABELS = { product: "Product page", header: "Header", checkout: "Checkout" };

export const regionOf = (state) => {
  if (!state) return "unknown";
  return state.trim().toLowerCase() === HOME_STATE ? "up" : "outside_up";
};

// Parses and clamps the report filters. The range never reaches further
// back than 365 days (the TTL) and defaults to the last 30 days.
// Region "outside_up" (the default) is the GST question: PINs with a
// verified state other than UP. "unknown" holds India Post outages and
// multi-state PINs, which are never counted as state-restriction demand.
export const parseReportFilters = (query = {}) => {
  const today = istTodayString();
  const earliest = istDaysAgoString(REPORT_MAX_DAYS - 1);

  let to = isDateString(query.to) ? query.to : today;
  let from = isDateString(query.from) ? query.from : istDaysAgoString(29);

  if (to > today) to = today;
  if (from < earliest) from = earliest;
  if (from > to) from = to;

  const region = ["all", "outside_up", "up", "unknown"].includes(query.region) ? query.region : "outside_up";
  const source = ["all", ...SOURCES].includes(query.source) ? query.source : "all";

  return {
    from,
    to,
    region,
    source,
    state: cleanText(query.state),
    district: cleanText(query.district),
    pincode: typeof query.pincode === "string" && /^\d{6}$/.test(query.pincode) ? query.pincode : "",
    product: isObjectIdString(query.product) ? query.product : "",
    category: isObjectIdString(query.category) ? query.category : "",
  };
};

// State / district / PIN / product / category filters (the region filter
// is applied inside buildDemandReport so unverified counts stay visible).
export const applyRowFilters = (docs, filters, productInfo = new Map()) =>
  docs.filter((doc) => {
    if (filters.state && !sameText(doc.state || "Unverified", filters.state)) return false;
    if (filters.district && !sameText(doc.district || "—", filters.district)) return false;
    if (filters.pincode && doc.pincode !== filters.pincode) return false;

    const productIds = [
      ...(doc.product ? [String(doc.product)] : []),
      ...(doc.items || []).map((item) => String(item.product)),
    ];

    if (filters.product && !productIds.includes(filters.product)) return false;

    if (filters.category) {
      const categories = [
        ...(doc.category ? [String(doc.category)] : []),
        ...productIds.map((id) => productInfo.get(id)?.categoryId).filter(Boolean),
      ];
      if (!categories.includes(filters.category)) return false;
    }

    return true;
  });

const hasCart = (doc) => doc.source === "checkout" && Boolean(doc.user) && doc.items?.length > 0;

// Each checkout customer's latest cart in the rows — the one counted in
// Potential Value (a cart re-checked on several days counts once).
const latestCartByCustomer = (rows) => {
  const latest = new Map();
  for (const doc of rows) {
    if (!hasCart(doc)) continue;
    const key = String(doc.user);
    const current = latest.get(key);
    if (!current || new Date(doc.lastAt) > new Date(current.lastAt)) latest.set(key, doc);
  }
  return latest;
};

const newGroup = (base) => ({
  ...base,
  checks: 0,
  checkoutAttempts: 0,
  quantity: 0,
  visitors: new Set(),
  checkoutCustomers: new Set(),
  potentialValue: 0,
  potentialCost: 0,
  costIncomplete: false,
});

const addToGroup = (map, key, base) => {
  if (!map.has(key)) map.set(key, newGroup(base));
  return map.get(key);
};

const finishGroups = (map) =>
  [...map.values()]
    .map(({ visitors, checkoutCustomers, potentialValue, potentialCost, costIncomplete, ...rest }) => ({
      ...rest,
      uniqueVisitors: visitors.size,
      checkoutCustomers: checkoutCustomers.size,
      potentialValue: roundMoney(potentialValue),
      // Never shown as a number when any counted line has no cost.
      estimatedMargin: costIncomplete ? null : roundMoney(potentialValue - potentialCost),
      costIncomplete,
    }))
    .sort(
      (a, b) =>
        b.uniqueVisitors - a.uniqueVisitors ||
        b.checkoutCustomers - a.checkoutCustomers ||
        b.potentialValue - a.potentialValue ||
        b.checks - a.checks,
    )
    .slice(0, REPORT_ROW_CAP);

// Pure aggregation over already-fetched rows (unit-testable).
//   docs: DeliveryDemand rows (lean), all regions
//   region: "all" | "outside_up" | "up" | "unknown"
//   productInfo: Map productId -> { name, category, categoryId }
//   users: Map userId -> { name, mobile }
//   lineFilter: optional (item) => boolean. With a product/category
//     filter only the matching cart lines count towards Potential Value
//     and Estimated Margin (review fix M1), not the whole cart.
// Outlier carts (review fix H2) are left out of every Potential Value /
// Estimated Margin figure and totalled separately.
export const buildDemandReport = (docs, { region = "all", productInfo = new Map(), users = new Map(), lineFilter = null } = {}) => {
  const cartPart = (doc) => {
    if (!lineFilter) {
      return { value: doc.cartValue || 0, cost: doc.cartCost || 0, incomplete: Boolean(doc.costIncomplete) };
    }
    const lines = (doc.items || []).filter(lineFilter);
    return {
      value: lines.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
      cost: lines.reduce((sum, item) => sum + item.unitCost * item.quantity, 0),
      incomplete: lines.some((item) => !(item.unitCost > 0)),
    };
  };

  const reasonChecks = { not_serviceable: 0, unverified: 0, ambiguous: 0 };
  for (const doc of docs) reasonChecks[doc.reason] = (reasonChecks[doc.reason] || 0) + (doc.attempts || 0);

  const rows = region === "all" ? docs : docs.filter((doc) => regionOf(doc.state) === region);
  const latestCart = latestCartByCustomer(rows);

  const visitors = new Set();
  const customers = new Set();
  let checks = 0;
  let checkoutAttempts = 0;

  const byState = new Map();
  const byDistrict = new Map();
  const byPincode = new Map();
  const byProduct = new Map();

  for (const doc of rows) {
    const attempts = doc.attempts || 0;
    const isCheckout = hasCart(doc);
    const isLatest = isCheckout && latestCart.get(String(doc.user)) === doc;
    const isCounted = isLatest && !doc.outlier;
    const part = isCounted ? cartPart(doc) : null;

    checks += attempts;
    if (isCheckout) checkoutAttempts += attempts;
    visitors.add(doc.visitorKey);
    if (doc.user) customers.add(String(doc.user));

    const state = doc.state || "Unverified";
    const district = doc.district || "—";
    const places = [
      addToGroup(byState, state, { state }),
      addToGroup(byDistrict, `${state}|${district}`, { state, district }),
      addToGroup(byPincode, doc.pincode, { pincode: doc.pincode, state, district }),
    ];

    for (const group of places) {
      group.checks += attempts;
      group.visitors.add(doc.visitorKey);
      if (isCheckout) {
        group.checkoutAttempts += attempts;
        group.checkoutCustomers.add(String(doc.user));
      }
      if (isCounted) {
        group.potentialValue += part.value;
        group.potentialCost += part.cost;
        if (part.incomplete) group.costIncomplete = true;
      }
    }

    const productLines = [];
    if (doc.source === "product" && doc.product) {
      productLines.push({ id: String(doc.product), name: doc.productName, checks: attempts });
    }
    if (isCheckout) {
      for (const item of doc.items) {
        if (lineFilter && !lineFilter(item)) continue;
        productLines.push({
          id: String(item.product),
          name: item.name,
          checks: 0,
          checkoutAttempts: attempts,
          counted: isCounted,
          quantity: item.quantity,
          value: item.unitPrice * item.quantity,
          cost: item.unitCost * item.quantity,
          incomplete: !(item.unitCost > 0),
        });
      }
    }

    for (const line of productLines) {
      const info = productInfo.get(line.id);
      const group = addToGroup(byProduct, line.id, {
        productId: line.id,
        product: info?.name || line.name || "(deleted product)",
        category: info?.category || "",
      });
      group.checks += line.checks;
      group.visitors.add(doc.visitorKey);
      if (line.checkoutAttempts) {
        group.checkoutAttempts += line.checkoutAttempts;
        group.checkoutCustomers.add(String(doc.user));
      }
      if (line.counted) {
        group.quantity += line.quantity;
        group.potentialValue += line.value;
        group.potentialCost += line.cost;
        if (line.incomplete) group.costIncomplete = true;
      }
    }
  }

  let potentialValue = 0;
  let potentialCost = 0;
  let completeValue = 0;
  let completeCost = 0;
  let incompleteCarts = 0;
  let outlierCarts = 0;
  let outlierValue = 0;
  const checkoutList = [];

  for (const [userId, doc] of latestCart) {
    const part = cartPart(doc);
    if (doc.outlier) {
      outlierCarts += 1;
      outlierValue += part.value;
    } else {
      potentialValue += part.value;
      potentialCost += part.cost;
      if (part.incomplete) incompleteCarts += 1;
      else {
        completeValue += part.value;
        completeCost += part.cost;
      }
    }

    const user = users.get(userId);
    checkoutList.push({
      userId,
      name: user?.name || "(deleted customer)",
      mobile: user?.mobile || "",
      pincode: doc.pincode,
      state: doc.state || "Unverified",
      district: doc.district || "",
      items: doc.items.map((item) => ({ name: item.name, size: item.size, quantity: item.quantity })),
      cartValue: roundMoney(doc.cartValue || 0),
      estimatedMargin: doc.costIncomplete ? null : roundMoney((doc.cartValue || 0) - (doc.cartCost || 0)),
      outlier: Boolean(doc.outlier),
      outlierReasons: doc.outlierReasons || [],
      attempts: rows.filter((row) => hasCart(row) && String(row.user) === userId).reduce((sum, row) => sum + (row.attempts || 0), 0),
      lastAt: doc.lastAt,
    });
  }

  checkoutList.sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));

  return {
    totals: {
      checks,
      checkoutAttempts,
      uniqueVisitors: visitors.size,
      loggedInCustomers: customers.size,
      checkoutCustomers: latestCart.size,
      potentialValue: roundMoney(potentialValue),
      // Null ("Margin Data Incomplete") when any counted cart lacks cost;
      // the margin of the carts that do have full cost is given alongside.
      estimatedMargin: incompleteCarts > 0 ? null : roundMoney(potentialValue - potentialCost),
      costIncomplete: incompleteCarts > 0,
      incompleteCarts,
      completeCartsValue: roundMoney(completeValue),
      completeCartsMargin: roundMoney(completeValue - completeCost),
      // Outlier carts: shown, never in the main totals above.
      outlierCarts,
      outlierValue: roundMoney(outlierValue),
      reasonChecks,
    },
    byState: finishGroups(byState),
    byDistrict: finishGroups(byDistrict),
    byPincode: finishGroups(byPincode),
    byProduct: finishGroups(byProduct),
    checkoutCustomers: checkoutList.slice(0, REPORT_ROW_CAP),
  };
};

// One demand row as shown in the detail report. A name/phone is attached
// only for a logged-in customer's checkout row with a cart.
export const toDemandRecord = (doc, { productInfo = new Map(), users = new Map(), countedIds = new Set() } = {}) => {
  const items = (doc.items || []).map((item) => {
    const lineValue = roundMoney(item.unitPrice * item.quantity);
    const lineCost = roundMoney(item.unitCost * item.quantity);
    const known = item.unitCost > 0;
    return {
      product: productInfo.get(String(item.product))?.name || item.name,
      size: item.size || "",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unitCost: known ? item.unitCost : null,
      lineValue,
      lineCost: known ? lineCost : null,
      lineMargin: known ? roundMoney(lineValue - lineCost) : null,
    };
  });

  const isCart = hasCart(doc);
  const user = isCart ? users.get(String(doc.user)) : null;

  return {
    id: String(doc._id),
    firstAt: doc.firstAt,
    lastAt: doc.lastAt,
    pincode: doc.pincode,
    state: doc.state || "Unverified",
    district: doc.district || "",
    source: doc.source,
    sourceLabel: SOURCE_LABELS[doc.source],
    reason: doc.reason,
    reasonLabel: REASON_LABELS[doc.reason],
    stage: isCart ? "Checkout with cart" : doc.source === "checkout" ? "Checkout (empty cart)" : "Interest (PIN check)",
    attempts: doc.attempts || 0,
    product: doc.product ? productInfo.get(String(doc.product))?.name || doc.productName : "",
    category: doc.product ? productInfo.get(String(doc.product))?.category || "" : "",
    items,
    quantity: isCart ? items.reduce((sum, item) => sum + item.quantity, 0) : null,
    cartValue: isCart ? roundMoney(doc.cartValue || 0) : null,
    cartCost: isCart && !doc.costIncomplete ? roundMoney(doc.cartCost || 0) : null,
    estimatedMargin: isCart && !doc.costIncomplete ? roundMoney((doc.cartValue || 0) - (doc.cartCost || 0)) : null,
    costIncomplete: isCart ? Boolean(doc.costIncomplete) : false,
    outlier: isCart ? Boolean(doc.outlier) : false,
    outlierReasons: isCart ? doc.outlierReasons || [] : [],
    countedInPotentialValue: countedIds.has(String(doc._id)),
    customer: user ? { name: user.name || "(deleted customer)", mobile: user.mobile || "" } : null,
  };
};

const loadRows = async (query) => {
  const filters = parseReportFilters(query);
  // Values come from the query string: resolved against our own list,
  // turned into Date objects or wrapped in $eq right here, next to the
  // query. A row's lastAt always falls on its own IST day (the day is part
  // of its key), so the lastAt range selects exactly the chosen days.
  const dbFilter = { lastAt: { $gte: istDayStart(filters.from), $lte: istDayEnd(filters.to) } };
  const knownSource = SOURCES.find((known) => known === filters.source);
  if (knownSource) dbFilter.source = knownSource;
  if (/^\d{6}$/.test(String(filters.pincode))) dbFilter.pincode = { $eq: String(filters.pincode) };

  const docs = await DeliveryDemand.find(dbFilter)
    .select("visitorKey user day pincode state district reason source product productName category items cartValue cartCost costIncomplete outlier outlierReasons attempts firstAt lastAt")
    .sort({ lastAt: -1 })
    .limit(REPORT_DOC_CAP)
    .lean();

  const productIds = new Set();
  for (const doc of docs) {
    if (doc.product) productIds.add(String(doc.product));
    for (const item of doc.items || []) if (item.product) productIds.add(String(item.product));
  }

  const products = productIds.size
    ? await Product.find({ _id: { $in: [...productIds] } }).select("name category").populate("category", "name").lean()
    : [];
  const productInfo = new Map(
    products.map((p) => [String(p._id), { name: p.name, category: p.category?.name || "", categoryId: p.category?._id ? String(p.category._id) : "" }]),
  );

  // Dropdown options: what exists for the chosen dates/source/region,
  // before the place/product filters narrow it down.
  const regionRows = filters.region === "all" ? docs : docs.filter((doc) => regionOf(doc.state) === filters.region);
  const states = [...new Set(regionRows.map((doc) => doc.state || "Unverified"))].sort();
  const districts = [
    ...new Set(
      regionRows
        .filter((doc) => !filters.state || sameText(doc.state || "Unverified", filters.state))
        .map((doc) => doc.district || "—"),
    ),
  ].sort();
  const categoryMap = new Map();
  for (const info of productInfo.values()) if (info.categoryId) categoryMap.set(info.categoryId, info.category);
  const productOptions = [...productInfo.entries()].map(([id, info]) => ({ id, name: info.name })).sort((a, b) => a.name.localeCompare(b.name));

  const rows = applyRowFilters(docs, filters, productInfo);

  // Review fix M1: with a product/category filter only matching cart
  // lines count towards Potential Value / Estimated Margin.
  const lineFilter =
    filters.product || filters.category
      ? (item) =>
          (!filters.product || String(item.product) === filters.product) &&
          (!filters.category || productInfo.get(String(item.product))?.categoryId === filters.category)
      : null;

  return {
    filters,
    rows,
    lineFilter,
    productInfo,
    truncated: docs.length >= REPORT_DOC_CAP,
    options: {
      states,
      districts,
      categories: [...categoryMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      products: productOptions,
    },
  };
};

const loadUsers = async (ids) => {
  const unique = [...new Set(ids.map(String))];
  const userDocs = unique.length ? await User.find({ _id: { $in: unique } }).select("name mobile").lean() : [];
  return new Map(userDocs.map((u) => [String(u._id), { name: u.name, mobile: u.mobile }]));
};

// ============================
// Delivery Demand report (Admin, "delivery-demand" permission)
// ============================
export const getDeliveryDemandReport = async (req, res) => {
  try {
    const { filters, rows, lineFilter, productInfo, truncated, options } = await loadRows(req.query);
    const users = await loadUsers(rows.filter(hasCart).map((doc) => doc.user));
    const report = buildDemandReport(rows, { region: filters.region, productInfo, users, lineFilter });

    // Review fix H1: guest checks refused by the per-network daily cap.
    // Not demand; shown so the owner can see how often the cap bites.
    const [limited] = await DeliveryDemandIpDay.aggregate([
      { $match: { day: { $gte: String(filters.from), $lte: String(filters.to) } } },
      { $group: { _id: null, attempts: { $sum: "$limitedAttempts" } } },
    ]);
    report.totals.limitedGuestAttempts = limited?.attempts || 0;

    res.json({ success: true, filters, truncated, options, ...report });
  } catch (error) {
    console.error("Delivery Demand Report Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Individual demand rows behind any tile or table row (drill-down).
// view=carts keeps only checkout rows with a cart (Potential Value /
// Estimated Margin), view=checkout all checkout rows.
export const getDeliveryDemandRecords = async (req, res) => {
  try {
    const { filters, rows, productInfo, truncated } = await loadRows(req.query);
    const regionRows = filters.region === "all" ? rows : rows.filter((doc) => regionOf(doc.state) === filters.region);
    const counted = latestCartByCustomer(regionRows);
    const countedIds = new Set([...counted.values()].filter((doc) => !doc.outlier).map((doc) => String(doc._id)));

    let selected = regionRows;
    if (req.query.view === "carts") selected = regionRows.filter(hasCart);
    else if (req.query.view === "checkout") selected = regionRows.filter((doc) => doc.source === "checkout");

    const pageSize = 50;
    const total = selected.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(pages, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const pageRows = selected.slice((page - 1) * pageSize, page * pageSize);
    const users = await loadUsers(pageRows.filter(hasCart).map((doc) => doc.user));

    res.json({
      success: true,
      filters,
      truncated,
      page,
      pages,
      total,
      records: pageRows.map((doc) => toDemandRecord(doc, { productInfo, users, countedIds })),
    });
  } catch (error) {
    console.error("Delivery Demand Records Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// CSV of the aggregate tables only — never names, phone numbers or ids.
const CSV_TABLES = {
  state: { key: "byState", columns: [["State", "state"]] },
  district: { key: "byDistrict", columns: [["State", "state"], ["District", "district"]] },
  pincode: { key: "byPincode", columns: [["PIN code", "pincode"], ["State", "state"], ["District", "district"]] },
  product: { key: "byProduct", columns: [["Product", "product"], ["Category", "category"], ["Quantity in carts", "quantity"]] },
};

const METRIC_COLUMNS = [
  ["Unique visitors", "uniqueVisitors"],
  ["Total attempts", "checks"],
  ["Checkout customers", "checkoutCustomers"],
  ["Checkout attempts", "checkoutAttempts"],
  ["Potential value (NOT revenue)", "potentialValue"],
  ["Estimated margin (NOT profit)", "estimatedMargin"],
];

export const csvCell = (value) => {
  let text = value === undefined || value === null ? "" : String(value);
  // A cell starting with = + - @ (or tab/CR) can run as a spreadsheet
  // formula when opened in Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const exportDeliveryDemandCsv = async (req, res) => {
  try {
    const table = CSV_TABLES[req.query.table];
    if (!table) return res.status(400).json({ success: false, message: "Unknown table" });

    const { filters, rows, lineFilter, productInfo } = await loadRows(req.query);
    const report = buildDemandReport(rows, { region: filters.region, productInfo, lineFilter });
    const columns = [...table.columns, ...METRIC_COLUMNS];
    const lines = [
      columns.map(([label]) => csvCell(label)).join(","),
      ...report[table.key].map((row) =>
        columns
          .map(([, field]) => csvCell(field === "estimatedMargin" && row.costIncomplete ? "Margin Data Incomplete" : row[field]))
          .join(","),
      ),
    ];

    const { from, to, region } = filters;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="delivery-demand-${req.query.table}-${region}-${from}-to-${to}.csv"`);
    res.send(`\uFEFF${lines.join("\r\n")}\r\n`);
  } catch (error) {
    console.error("Delivery Demand CSV Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
