// Turns a product's purchase price + purchase month/year into a plain
// number for the printed shelf label — reads like a generic serial/
// tracking number to anyone else, but the shop owner can pull the real
// numbers back out by hand:
//   1. drop the last digit (a per-product decoy, not part of the data)
//   2. the next 2 digits, minus 10, are the month
//   3. the next 4 digits, minus 1000, are the year
//   4. whatever's left at the front, minus 100, is the purchase price
//
// e.g. price 120, June 2025 -> "220302516x" (220=120+100, 3025=2025+1000,
// 16=June+10, trailing digit varies per product).
export const generateProductNumber = ({
  purchaseDate,
  purchasePrice,
  productId,
}) => {
  const date = purchaseDate ? new Date(purchaseDate) : new Date();

  const shiftedMonth = date.getMonth() + 1 + 10;
  const shiftedYear = date.getFullYear() + 1000;
  const shiftedPrice = Math.max(0, Math.round(purchasePrice || 0)) + 100;

  // Stable per product (not random per page load), so the same product
  // always prints the same number — derived from its own id, unrelated
  // to price or date.
  const idString = String(productId || "");
  const lastHexChar = idString.slice(-1) || "0";
  const trailingDigit = parseInt(lastHexChar, 16) % 10;

  return `${shiftedPrice}${shiftedYear}${shiftedMonth}${trailingDigit}`;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Reverses generateProductNumber by hand, for the admin decode tool.
// Returns null if the string is too short to hold a valid price+year+month.
// Includes a step-by-step breakdown so the UI can show its working, not
// just the final numbers.
export const decodeProductNumber = (numberString) => {
  const digits = String(numberString || "").replace(/\D/g, "");

  // trailing decoy digit + 2 (month) + 4 (year) = 7 minimum, leaving at
  // least 1 digit for the price.
  if (digits.length < 8) return null;

  const trailingDigit = digits.slice(-1);
  const withoutTrailing = digits.slice(0, -1);
  const monthPart = withoutTrailing.slice(-2);
  const yearPart = withoutTrailing.slice(-6, -2);
  const pricePart = withoutTrailing.slice(0, -6);

  const month = Number(monthPart) - 10;
  const year = Number(yearPart) - 1000;
  const purchasePrice = Number(pricePart) - 100;

  if (month < 1 || month > 12 || purchasePrice < 0 || !pricePart) return null;

  return {
    month: String(month).padStart(2, "0"),
    monthName: MONTH_NAMES[month - 1],
    year: String(year),
    purchasePrice,
    breakdown: [
      `Last digit "${trailingDigit}" dropped — it's just a per-product marker, not part of the data.`,
      `Next 2 digits "${monthPart}" − 10 = month ${String(month).padStart(2, "0")} (${MONTH_NAMES[month - 1]}).`,
      `Next 4 digits "${yearPart}" − 1000 = year ${year}.`,
      `Remaining digits "${pricePart}" − 100 = purchase price ₹${purchasePrice}.`,
    ],
  };
};
