import { useEffect, useState } from "react";

import { useAuth } from "../context/AuthContext";
import { getAddresses } from "../services/addressService";
import { getMyLocation } from "../services/analyticsService";

// Same "is this a crawler" list vercel.json uses to route bots to the
// prerendered meta-tag response for /product and /category — reused here
// so search engines always see the Vasundhara/Vaishali/Indirapuram local
// -SEO content this hook gates, regardless of where the crawler's own
// servers are physically located (never Ghaziabad).
const BOT_UA_PATTERN =
  /bot|facebookexternalhit|WhatsApp|Pinterest|embedly|Quora Link Preview|Slurp|ia_archiver|Discordbot|TelegramBot|redirectionio|Googlebot|Bingbot|DuckDuckBot|Baiduspider|YandexBot|Twitterbot|LinkedInBot/i;

// Shared by DeliveryOfferBanner and Footer's "We Deliver To" section — both
// only make sense for customers actually near Ghaziabad. Mirrors the same
// saved-address -> IP-geolocation fallback Header.jsx uses for "Deliver
// to [city]", so all three stay consistent about where a visitor "is".
//
// Optimistic true — most of this early-stage site's traffic is local, and
// IP-geolocation is unreliable enough (see Header.jsx's own note on this)
// that defaulting to hidden-until-confirmed would wrongly hide these from
// real Ghaziabad customers whenever geo lookup comes back empty. Only
// flips to false once we get a confident non-Ghaziabad city match.
export function useIsGhaziabadVisitor() {
  const { isLoggedIn } = useAuth();
  const [isGhaziabad, setIsGhaziabad] = useState(true);

  useEffect(() => {
    // Crawlers never get geo-gated — this content exists specifically for
    // local search visibility, so hiding it from Googlebot (whose crawl
    // servers obviously never resolve to a Ghaziabad IP) would silently
    // undo the whole point of having it.
    if (BOT_UA_PATTERN.test(navigator.userAgent)) return;

    const checkCity = async () => {
      if (isLoggedIn) {
        const response = await getAddresses();

        if (response.success && response.addresses.length > 0) {
          const address =
            response.addresses.find((a) => a.isDefault) ||
            response.addresses[0];

          if (address.city) {
            setIsGhaziabad(address.city.toLowerCase().includes("ghaziabad"));
          }
          return;
        }
      }

      const response = await getMyLocation();
      const { city } = response.location || {};

      if (city) {
        setIsGhaziabad(city.toLowerCase().includes("ghaziabad"));
      }
    };

    checkCity();
  }, [isLoggedIn]);

  return isGhaziabad;
}
