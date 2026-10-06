import { DELIVERY_AREAS } from "./deliveryAreas";
import { SITE_URL } from "./siteUrl";

// Google treats every emission of this same @id as describing ONE
// business entity, not several — so Home.jsx/Contact.jsx/
// GhaziabadStore.jsx each hand-rolling their own HomeGoodsStore block
// independently had drifted into three different, non-overlapping
// property sets (priceRange only on Home, email only on Contact,
// postalCode only on Ghaziabad) for what Google reads as one record.
// One shared builder, used everywhere, makes that structurally
// impossible to repeat.
const DEFAULT_ADDRESS = {
  addressLocality: "Ghaziabad",
  addressRegion: "Uttar Pradesh",
  addressCountry: "IN",
};

const DAY_MAP = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

// settings.supportHours is a free-text admin field (placeholder: "Mon -
// Sat: 11:00 - 18:00"), not structured day/time fields — only emitting
// openingHoursSpecification when it matches that exact expected shape
// avoids ever publishing a WRONG guess at opening hours, which would be
// worse for trust/accuracy than omitting the field entirely. Anything
// that doesn't match (empty, a different format, a free-text note like
// "Closed on public holidays") is simply left out, not parsed loosely.
const parseSupportHours = (supportHours) => {
  if (!supportHours) return undefined;

  const match = supportHours
    .trim()
    .match(
      /^(\w{3})\s*-\s*(\w{3}):\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/i,
    );

  if (!match) return undefined;

  const [, fromDay, toDay, opens, closes] = match;
  const fromIndex = Object.keys(DAY_MAP).indexOf(fromDay.toLowerCase());
  const toIndex = Object.keys(DAY_MAP).indexOf(toDay.toLowerCase());

  if (fromIndex === -1 || toIndex === -1 || toIndex < fromIndex) return undefined;

  const dayOfWeek = Object.values(DAY_MAP).slice(fromIndex, toIndex + 1);

  return {
    "@type": "OpeningHoursSpecification",
    dayOfWeek,
    opens,
    closes,
  };
};

// `includeAreaServed`: GhaziabadStore/render.js (the dedicated local-SEO
// landing page) and Home.jsx both want the full delivery-area list;
// Contact.jsx deliberately doesn't (it's a support/contact page, not a
// local-intent landing page) — same as each page's own existing choice
// before this consolidation, just no longer able to silently diverge on
// the fields that SHOULD always match (telephone/email/priceRange/
// openingHoursSpecification/address/sameAs).
export const buildLocalBusinessJsonLd = (
  settings,
  { streetAddress, postalCode, includeAreaServed = false } = {},
) => {
  const address = streetAddress || settings.address;
  if (!address) return null;

  const openingHoursSpecification = parseSupportHours(settings.supportHours);

  return {
    "@context": "https://schema.org",
    "@type": "HomeGoodsStore",
    "@id": `${SITE_URL}/#business`,
    name: "Mittal Collections",
    url: `${SITE_URL}/`,
    telephone: settings.phone || undefined,
    email: settings.email || undefined,
    priceRange: "₹₹",
    ...(openingHoursSpecification && { openingHoursSpecification }),
    address: {
      "@type": "PostalAddress",
      streetAddress: address,
      ...DEFAULT_ADDRESS,
      ...(postalCode && { postalCode }),
    },
    ...(includeAreaServed && {
      areaServed: [
        ...DELIVERY_AREAS.map((area) => ({
          "@type": "Place",
          name: `${area}, Ghaziabad`,
        })),
        { "@type": "City", name: "Ghaziabad" },
      ],
    }),
    sameAs: [settings.facebook, settings.instagram, settings.twitter].filter(
      Boolean,
    ),
  };
};
