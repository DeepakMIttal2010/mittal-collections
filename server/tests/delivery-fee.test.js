import { describe, it, expect } from "vitest";

import { calculateDeliveryFee } from "../utils/shipping.js";

// Pure function — no DB, no app needed, so this file doesn't import
// ./setup.js at all.
describe("calculateDeliveryFee", () => {
  it("is free at or above the free-shipping threshold", () => {
    const settings = { freeShippingThreshold: 499, deliveryFee: 49 };

    expect(calculateDeliveryFee(499, settings)).toBe(0);
    expect(calculateDeliveryFee(1000, settings)).toBe(0);
  });

  it("falls back to the flat deliveryFee when no tiers are configured", () => {
    const settings = { freeShippingThreshold: 499, deliveryFee: 49 };

    expect(calculateDeliveryFee(200, settings)).toBe(49);
  });

  it("uses the flat deliveryFee default (49) when settings has neither a fee nor tiers", () => {
    expect(calculateDeliveryFee(200, {})).toBe(49);
  });

  it("uses the free-shipping default (499) when settings doesn't set one", () => {
    expect(calculateDeliveryFee(499, {})).toBe(0);
    expect(calculateDeliveryFee(498, {})).toBe(49);
  });

  it("picks the correct graduated tier below the threshold", () => {
    const settings = {
      freeShippingThreshold: 499,
      deliveryFee: 49,
      shippingTiers: [
        { maxOrderValue: 199, fee: 49 },
        { maxOrderValue: 349, fee: 39 },
        { maxOrderValue: 499, fee: 25 },
      ],
    };

    expect(calculateDeliveryFee(150, settings)).toBe(49); // < 199
    expect(calculateDeliveryFee(300, settings)).toBe(39); // < 349
    expect(calculateDeliveryFee(450, settings)).toBe(25); // < 499
    expect(calculateDeliveryFee(499, settings)).toBe(0); // >= threshold, free
  });

  it("works correctly regardless of the order the tiers are listed in", () => {
    const settings = {
      freeShippingThreshold: 499,
      deliveryFee: 49,
      shippingTiers: [
        { maxOrderValue: 499, fee: 25 },
        { maxOrderValue: 199, fee: 49 },
        { maxOrderValue: 349, fee: 39 },
      ],
    };

    expect(calculateDeliveryFee(300, settings)).toBe(39);
  });

  it("falls back to the flat fee if the subtotal doesn't match any tier", () => {
    // Tiers only cover up to 349; a subtotal of 400 (still below the
    // 499 free threshold) matches no tier and should fall back.
    const settings = {
      freeShippingThreshold: 499,
      deliveryFee: 49,
      shippingTiers: [
        { maxOrderValue: 199, fee: 49 },
        { maxOrderValue: 349, fee: 39 },
      ],
    };

    expect(calculateDeliveryFee(400, settings)).toBe(49);
  });
});
