import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import Seo from "../components/Seo";
import { useLanguage } from "../context/LanguageContext";
import LazyMount from "../components/LazyMount";
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
import { SITE_URL } from "../utils/siteUrl";
import { buildLocalBusinessJsonLd } from "../utils/localBusinessJsonLd";

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
  const location = useLocation();
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  const isHindi = location.pathname === "/hi";

  useEffect(() => {
    const loadSettings = async () => {
      const response = await getSiteSettings();

      if (response.success) setSettings(response.settings);
    };

    loadSettings();
  }, []);

  // Same first-load-syncs-both-directions pattern as CategoryPage.jsx/
  // ProductDetails.jsx (PR #279) — a visitor landing directly on "/hi"
  // must see the toggle flip to Hindi immediately (not wait for a click),
  // and a stale "hi" toggle left over from browsing a /hi/ page earlier
  // must not leak Hindi content onto this plain "/" visit. Only a later,
  // genuine toggle click (after the ref is set) navigates the URL.
  const hasSyncedLanguageRef = useRef(false);
  useEffect(() => {
    if (!hasSyncedLanguageRef.current) {
      hasSyncedLanguageRef.current = true;
      if ((language === "hi") !== isHindi) setLanguage(isHindi ? "hi" : "en");
      return;
    }

    const wantHindi = language === "hi";
    if (wantHindi === isHindi) return;
    navigate(wantHindi ? "/hi" : "/", { replace: true });
  }, [isHindi, language, navigate, setLanguage]);

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
    settings.linkedin,
  ].filter(Boolean);

  const organizationJsonLd = {
    ...baseOrganizationJsonLd,
    ...(socialSameAs.length > 0 && { sameAs: socialSameAs }),
  };

  const localBusinessJsonLd = buildLocalBusinessJsonLd(settings, {
    // Same PIN code GhaziabadStore.jsx already passes explicitly —
    // Google's Rich Results Test flagged this page's address as missing
    // the optional postalCode field (2026-10-14).
    postalCode: "201012",
    includeAreaServed: true,
  });

  // Kept in sync with render.js's buildMeta homepage branch by hand (that
  // serverless function doesn't share a bundle with client/src) — see
  // its own comment for why a mismatch here is the bot-visible bug, not
  // this one.
  const enHomeUrl = `${SITE_URL}/`;
  const hiHomeUrl = `${SITE_URL}/hi`;
  const alternateLangs = [
    { lang: "en", url: enHomeUrl },
    { lang: "hi", url: hiHomeUrl },
    { lang: "x-default", url: enHomeUrl },
  ];

  return (
    <>
      <Seo
        title={
          isHindi
            ? "बेडशीट, पर्दे, होम डेकोर ऑनलाइन"
            : "Bedsheets, Curtains, Home Decor Online"
        }
        description={
          isHindi
            ? "Mittal Collections पर बेडशीट, कम्फर्टर, पर्दे और होम फर्निशिंग ऑनलाइन खरीदें। हर कमरे के लिए स्टाइलिश डिज़ाइन और क्वालिटी फैब्रिक एक्सप्लोर करें।"
            : "Shop bedsheets, comforters, curtains and home furnishings online at Mittal Collections. Explore stylish designs, quality fabrics and home essentials for every room."
        }
        url={isHindi ? hiHomeUrl : enHomeUrl}
        lang={isHindi ? "hi" : "en"}
        alternateLangs={alternateLangs}
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
      {/* Below-the-fold from here on every real viewport (16 sections
          total on this page) — deferring these specifically cut ~1s of
          main-thread blocking time in a throttled Lighthouse trace, see
          LazyMount's own comment for the full reasoning.
          Faq is deliberately NOT deferred here, unlike its neighbours —
          it carries real FAQPage JSON-LD tied to its visible questions
          (already confirmed picked up by Rich Results Test), and
          IntersectionObserver-gated content isn't guaranteed to be seen
          the same way by a crawler that doesn't scroll the way a real
          visitor does. Not worth risking that for a CWV gain. */}
      <LazyMount>
        <WhyChooseUs />
      </LazyMount>
      <LazyMount>
        <Testimonials />
      </LazyMount>
      <LazyMount>
        <CustomerGallery />
      </LazyMount>
      <Faq />
      <LazyMount>
        <Newsletter />
      </LazyMount>
    </>
  );
}

export default Home;
