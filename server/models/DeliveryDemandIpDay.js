import mongoose from "mongoose";

// PR-B2 review fix H1: caps how many different guest browsers one network
// can add to the Delivery Demand report per IST day, so a script that
// invents a new visitorId on every request can't manufacture "unique
// visitors". One document per (hashed IP, day):
//   ipHash   HMAC of the server-derived client IP and the day — the raw
//            IP is never stored, and the same IP can't be linked across
//            days.
//   visitors the (already hashed) guest visitorKeys accepted that day;
//            at most GUEST_VISITORS_PER_IP_PER_DAY.
//   limitedAttempts checks refused because the cap was full. Reported
//            separately in the admin report, never counted as demand.
const deliveryDemandIpDaySchema = new mongoose.Schema({
  ipHash: { type: String, required: true },
  day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  visitors: { type: [String], default: [] },
  limitedAttempts: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

deliveryDemandIpDaySchema.index({ ipHash: 1, day: 1 }, { unique: true });
deliveryDemandIpDaySchema.index({ day: 1 });
// Same retention as the demand rows themselves.
deliveryDemandIpDaySchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

const DeliveryDemandIpDay = mongoose.model("DeliveryDemandIpDay", deliveryDemandIpDaySchema);

export default DeliveryDemandIpDay;
