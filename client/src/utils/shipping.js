// Mirrors server/utils/shipping.js so the cart/checkout pages can preview
// the exact delivery fee the backend will charge before the order is placed.
export const calculateDeliveryFee = (subtotal, settings) => {
  const threshold = settings?.freeShippingThreshold ?? 499;

  if (subtotal >= threshold) return 0;

  const tiers = [...(settings?.shippingTiers || [])].sort(
    (a, b) => a.maxOrderValue - b.maxOrderValue,
  );

  const matchedTier = tiers.find((tier) => subtotal < tier.maxOrderValue);

  return matchedTier ? matchedTier.fee : (settings?.deliveryFee ?? 49);
};
