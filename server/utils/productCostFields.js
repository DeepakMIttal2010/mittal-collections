// Never sent by a public route — cost data and adminRemarks are both
// admin-only (see Product.js's own comment on adminRemarks: "never shown
// to customers"). The nested variants.purchasePrice needs its own
// dotted exclusion; a bare "-purchasePrice" only strips the top-level
// field, not the same-named field inside each variants[] subdocument.
// Security audit (2026-09-29) found adminRemarks was missing from this
// list despite its own documented intent -- live-confirmed 51 products'
// internal sourcing/pricing notes were readable via the public product
// endpoints before this fix.
//
// Shared so every controller that hands a product to a customer (not
// just productController) strips the same fields -- the wishlist
// populate didn't, and leaked them (deep bug sweep round 29).
export const COST_FIELDS =
  "-purchasePrice -miscExpenses -purchaseDate -variants.purchasePrice -adminRemarks -adminRemarksUpdatedAt";
