// Graduated delivery fee: free above freeShippingThreshold, otherwise
// the fee steps down as the order gets closer to that threshold, using
// admin-configured tiers. Falls back to the flat deliveryFee if no tier
// matches (or none are configured), so this stays backward-compatible.
export const calculateDeliveryFee = (subtotal, settings) => {
  const threshold = settings.freeShippingThreshold ?? 499;

  if (subtotal >= threshold) return 0;

  const tiers = [...(settings.shippingTiers || [])].sort(
    (a, b) => a.maxOrderValue - b.maxOrderValue,
  );

  const matchedTier = tiers.find((tier) => subtotal < tier.maxOrderValue);

  return matchedTier ? matchedTier.fee : (settings.deliveryFee ?? 49);
};
