// Areas the site currently promises fast 24-hour delivery to. Single
// source of truth on the client side — both the footer's area list and
// the product-page pincode checker read from this, so they can never
// drift apart. Mirrored at server/utils/deliveryAreas.js for the backend
// pincode-check proxy (client/server are separate npm packages here, so
// it can't be one shared import) — keep both copies in sync.
export const DELIVERY_AREAS = [
  "Vasundhara",
  "Vaishali",
  "Indirapuram",
  "Kaushambi",
  "Sahibabad",
  "Mohan Nagar",
  "Rajendra Nagar",
  "Lajpat Nagar",
  "Suryanagar",
  "Brij Vihar",
];
