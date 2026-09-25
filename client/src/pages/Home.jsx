import { useEffect, useState } from "react";

import Seo from "../components/Seo";
import Hero from "../components/Hero/Hero";
import CategoryQuickLinks from "../components/CategoryQuickLinks/CategoryQuickLinks";
import TrustBar from "../components/TrustBar/TrustBar";
import RewardsStrip from "../components/RewardsStrip/RewardsStrip";
import RecentlyViewed from "../components/RecentlyViewed/RecentlyViewed";
import Categories from "../components/Categories/Categories";
import TrendingSection from "../components/TrendingSection/TrendingSection";
import ClearanceSale from "../components/ClearanceSale/ClearanceSale";
import SizeShowcase from "../components/SubcategoryShowcase/SizeShowcase";
import PriceShowcase from "../components/PriceShowcase/PriceShowcase";
import WhyChooseUs from "../components/WhyChooseUs/WhyChooseUs";
import Testimonials from "../components/Testimonials/Testimonials";
import CustomerGallery from "../components/CustomerGallery";
import Newsletter from "../components/Newsletter/Newsletter";
import CategoryNewArrivals from "../components/NewArrivals/CategoryNewArrivals";
import Faq from "../components/Faq/Faq";
import { getSiteSettings } from "../services/settingsService";
import { DELIVERY_AREAS } from "../utils/deliveryAreas";
import { SITE_URL } from "../utils/siteUrl";

// Unconditional — unlike the HomeGoodsStore/LocalBusiness block below
// (which needs an admin-configured address to be meaningful), this is
// always valid and should never depend on any async data being loaded,
// so the homepage is never left with zero structured data at all.
// sameAs is added inside the component once settings load (see
// organizationJsonLd below) rather than here, since it needs
// settings.facebook/instagram/twitter — the base object here is what
// renders before that data arrives.
const baseOrganizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: "Mittal Collections",
  url: `${SITE_URL}/`,
  // icon-512.png is the site's only real brand mark (a gold circular
  // "M" monogram used as the PWA icon) — reused here rather than adding
  // a separate logo asset. Unconditional, same reasoning as everything
  // else in this base object.
  logo: {
    "@type": "ImageObject",
    url: `${SITE_URL}/icon-512.png`,
  },
};

// potentialAction doesn't depend on any runtime data — SearchResults.jsx
// already reads its query from a plain `?q=` param, so this is exactly
// the URL shape Google's sitelinks-searchbox feature needs, just never
// declared.
const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  name: "Mittal Collections",
  url: `${SITE_URL}/`,
  potentialAction: {
    "@type": "SearchAction",
    // schema.org's Action.target expects an EntryPoint, not a bare
    // string — Google's parser tolerates the flat-string form today,
    // but EntryPoint/urlTemplate is what the spec and Google's current
    // Sitelinks Searchbox docs actually show.
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

function Home() {
  const [settings, setSettings] = useState({});

  useEffect(() => {
    const loadSettings = async () => {
      const response = await getSiteSettings();

      if (response.success) setSettings(response.settings);
    };

    loadSettings();
  }, []);

  // Base fields always present (see baseOrganizationJsonLd's comment);
  // sameAs only gets added once settings load, same social links
  // localBusinessJsonLd/Contact.jsx already use for the same purpose —
  // this was previously the one JSON-LD block guaranteed to always
  // render that DIDN'T carry it, while the conditional block below
  // duplicated it.
  const socialSameAs = [
    settings.facebook,
    settings.instagram,
    settings.twitter,
  ].filter(Boolean);

  const organizationJsonLd = {
    ...baseOrganizationJsonLd,
    ...(socialSameAs.length > 0 && { sameAs: socialSameAs }),
  };

  const localBusinessJsonLd = settings.address
    ? {
        "@context": "https://schema.org",
        "@type": "HomeGoodsStore",
        "@id": `${SITE_URL}/#business`,
        name: "Mittal Collections",
        url: `${SITE_URL}/`,
        telephone: settings.phone || undefined,
        priceRange: "₹₹",
        address: {
          "@type": "PostalAddress",
          streetAddress: settings.address,
          addressLocality: "Ghaziabad",
          addressRegion: "Uttar Pradesh",
          addressCountry: "IN",
        },
        areaServed: [
          ...DELIVERY_AREAS.map((area) => ({
            "@type": "Place",
            name: `${area}, Ghaziabad`,
          })),
          { "@type": "City", name: "Ghaziabad" },
        ],
        sameAs: [
          settings.facebook,
          settings.instagram,
          settings.twitter,
        ].filter(Boolean),
      }
    : null;

  return (
    <>
      <Seo
        title="Bedsheets, Curtains & Towels Online"
        description="Shop premium cotton bedsheets, curtains, towels, cushions & doormats online with pan-India delivery — fast 24-hour delivery in Ghaziabad. Easy returns."
        url={`${SITE_URL}/`}
        jsonLd={[organizationJsonLd, websiteJsonLd, localBusinessJsonLd]}
      />
      <Hero />
      <CategoryQuickLinks />
      <TrustBar />
      <RewardsStrip />
      <RecentlyViewed />
      <Categories />
      <TrendingSection />
      <ClearanceSale />
      <SizeShowcase />
      <PriceShowcase />
      <CategoryNewArrivals />
      <WhyChooseUs />
      <Testimonials />
      <CustomerGallery />
      <Faq />
      <Newsletter />
    </>
  );
}

export default Home;
