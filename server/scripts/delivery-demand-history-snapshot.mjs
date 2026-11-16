// PR-B2 Delivery Demand — one-time HISTORICAL snapshot (READ-ONLY).
//
// What data already exists, before demand tracking started, about where
// shoppers are? It only READS (find / countDocuments / aggregate); it
// never writes, updates or deletes anything.
//
//   cd server
//   MONGODB_URI="<read-only connection string>" node scripts/delivery-demand-history-snapshot.mjs
//   (add --json for machine-readable output)
//
// Sources and their limits:
//   1. PincodeLookup cache: every PIN verified through India Post in
//      the last ~90 days (TTL), including outside-UP PINs that shoppers
//      checked. Each row is one PIN, not a count of checks or people.
//   2. Saved addresses: customers' saved delivery addresses. A saved
//      address is NOT a blocked purchase attempt. Its state is the typed
//      state, cross-checked against the PIN cache where possible.
//   3. Orders: shipping addresses of past website orders (non-cancelled).
//   4. DeliveryDemand: rows recorded since this feature went live.
// None of these can be added together as "lost orders".
import mongoose from "mongoose";

import PincodeLookup from "../models/PincodeLookup.js";
import Address from "../models/Address.js";
import Order from "../models/Order.js";
import DeliveryDemand from "../models/DeliveryDemand.js";

const HOME_STATE = "uttar pradesh";
const asJson = process.argv.includes("--json");

const norm = (value) => (typeof value === "string" ? value.trim() : "");
const isHome = (state) => norm(state).toLowerCase() === HOME_STATE;

const countBy = (rows, keyOf) => {
  const map = new Map();
  for (const row of rows) {
    const key = keyOf(row) || "(unknown)";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }));
};

const main = async () => {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Use a READ-ONLY database user.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false });

  const lookups = await PincodeLookup.find({}).select("pincode state district verifiedAt").lean();
  const lookupByPin = new Map(lookups.map((row) => [row.pincode, row]));

  const addresses = await Address.find({}).select("state city pincode user").lean();
  const orders = await Order.find({ orderStatus: { $ne: "Cancelled" } })
    .select("shippingAddress.state shippingAddress.pincode createdAt")
    .lean();
  const demandRows = await DeliveryDemand.countDocuments({});

  const stateOfAddress = (row) => lookupByPin.get(norm(row.pincode))?.state || norm(row.state);

  const outsideLookups = lookups.filter((row) => !isHome(row.state));
  const outsideAddresses = addresses.filter((row) => !isHome(stateOfAddress(row)));
  const outsideOrders = orders.filter((row) => {
    const pin = norm(row.shippingAddress?.pincode);
    return !isHome(lookupByPin.get(pin)?.state || row.shippingAddress?.state);
  });

  const snapshot = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    pinCache: {
      note: "PINs verified via India Post in roughly the last 90 days; one row per PIN, not per check or person.",
      totalPins: lookups.length,
      outsideUpPins: outsideLookups.length,
      outsideUpByState: countBy(outsideLookups, (row) => norm(row.state)),
      outsideUpByDistrict: countBy(outsideLookups, (row) => `${norm(row.state)} / ${norm(row.district) || "—"}`).slice(0, 50),
    },
    savedAddresses: {
      note: "Customers' saved addresses. Not purchase attempts. State from the PIN cache when known, else as typed.",
      total: addresses.length,
      customers: new Set(addresses.map((row) => String(row.user))).size,
      outsideUp: outsideAddresses.length,
      outsideUpCustomers: new Set(outsideAddresses.map((row) => String(row.user))).size,
      outsideUpByState: countBy(outsideAddresses, stateOfAddress),
    },
    orders: {
      note: "Non-cancelled website orders by shipping state. Orders outside UP are blocked since 2026-10-31 (UP-only gate).",
      total: orders.length,
      outsideUp: outsideOrders.length,
      byState: countBy(orders, (row) => lookupByPin.get(norm(row.shippingAddress?.pincode))?.state || norm(row.shippingAddress?.state)),
    },
    deliveryDemand: {
      note: "Rows recorded by the live feature (see Admin > Delivery Demand).",
      rows: demandRows,
    },
  };

  if (asJson) {
    console.log(JSON.stringify(snapshot, null, 2));
  } else {
    console.log("Delivery Demand — historical snapshot (read-only)");
    console.log(`Generated ${snapshot.generatedAt}\n`);
    console.log(`PIN cache: ${snapshot.pinCache.totalPins} PINs, ${snapshot.pinCache.outsideUpPins} outside UP`);
    for (const { key, count } of snapshot.pinCache.outsideUpByState) console.log(`  ${key}: ${count} PIN(s)`);
    console.log(`\nSaved addresses: ${snapshot.savedAddresses.total} (${snapshot.savedAddresses.customers} customers), outside UP ${snapshot.savedAddresses.outsideUp} (${snapshot.savedAddresses.outsideUpCustomers} customers)`);
    for (const { key, count } of snapshot.savedAddresses.outsideUpByState) console.log(`  ${key}: ${count}`);
    console.log(`\nOrders (non-cancelled): ${snapshot.orders.total}, outside UP ${snapshot.orders.outsideUp}`);
    for (const { key, count } of snapshot.orders.byState) console.log(`  ${key}: ${count}`);
    console.log(`\nDeliveryDemand rows so far: ${snapshot.deliveryDemand.rows}`);
    console.log("\nLimits: none of these numbers are lost orders or revenue; they cannot be added together.");
  }

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error("Snapshot failed:", error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
