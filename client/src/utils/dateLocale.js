// Resolves which locale a date should format in, based on the site's
// own language toggle — every `toLocaleDateString`/`toLocaleString` call
// on a customer-facing date was hardcoded to "en-IN", so dates (order
// placed/delivered, review/question timestamps, ticket messages, loyalty
// history) always showed English month names even when a customer had
// switched the whole rest of the UI to Hindi. A 2026-10-05 i18n audit
// found this across 10 customer-facing files.
export const dateLocale = (language) => (language === "hi" ? "hi-IN" : "en-IN");
