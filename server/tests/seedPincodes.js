import { beforeEach } from "vitest";
import PincodeLookup from "../models/PincodeLookup.js";

// The Ghaziabad PINs test orders ship to, pre-verified before every test
// so the UP-only delivery gate (utils/deliveryEligibility.js) never
// reaches India Post during the suite. Imported by setup.js and
// setup-replset.js; tests of the gate itself mock fetch for other PINs.
export const TEST_UP_PINCODES = ["201001", "201012"];

beforeEach(async () => {
  await PincodeLookup.insertMany(
    TEST_UP_PINCODES.map((pincode) => ({
      pincode,
      state: "Uttar Pradesh",
      district: "Ghaziabad",
      verifiedAt: new Date(),
    })),
  );
});
