// Turns a product's purchase price + purchase month/year into a plain
// number for the printed shelf label — reads like a generic serial/
// tracking number to anyone else, but the shop owner can pull the real
// numbers back out by hand:
//   1. drop the last digit (a per-product decoy, not part of the data)
//   2. the next 2 digits are the month
//   3. the next 4 digits, minus 1000, are the year
//   4. whatever's left at the front, minus 100, is the purchase price
//
// e.g. price 120, June 2025 -> "22030264" (220=120+100, 3025=2025+1000,
// 06=month, trailing digit varies per product).
export const generateProductNumber = ({
  purchaseDate,
  purchasePrice,
  productId,
}) => {
  const date = purchaseDate ? new Date(purchaseDate) : new Date();

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const shiftedYear = date.getFullYear() + 1000;
  const shiftedPrice = Math.max(0, Math.round(purchasePrice || 0)) + 100;

  // Stable per product (not random per page load), so the same product
  // always prints the same number — derived from its own id, unrelated
  // to price or date.
  const idString = String(productId || "");
  const lastHexChar = idString.slice(-1) || "0";
  const trailingDigit = parseInt(lastHexChar, 16) % 10;

  return `${shiftedPrice}${shiftedYear}${month}${trailingDigit}`;
};
