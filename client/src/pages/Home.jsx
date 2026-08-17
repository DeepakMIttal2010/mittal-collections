import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Seo from "../components/Seo";
import Hero from "../components/Hero/Hero";
import CategoryQuickLinks from "../components/CategoryQuickLinks/CategoryQuickLinks";
import TrustBar from "../components/TrustBar/TrustBar";
import RecentlyViewed from "../components/RecentlyViewed/RecentlyViewed";
import Categories from "../components/Categories/Categories";
import TrendingSection from "../components/TrendingSection/TrendingSection";
import SizeShowcase from "../components/SubcategoryShowcase/SizeShowcase";
import PriceShowcase from "../components/PriceShowcase/PriceShowcase";
import WhyChooseUs from "../components/WhyChooseUs/WhyChooseUs";
import Testimonials from "../components/Testimonials/Testimonials";
import Newsletter from "../components/Newsletter/Newsletter";
import NewArrivals from "../components/NewArrivals/NewArrivals";
import Faq from "../components/Faq/Faq";
import { getSiteSettings } from "../services/settingsService";

function Home() {
  const [settings, setSettings] = useState({});

  useEffect(() => {
    const loadSettings = async () => {
      const response = await getSiteSettings();

      if (response.success) setSettings(response.settings);
    };

    loadSettings();
  }, []);

  const localBusinessJsonLd = settings.address
    ? {
        "@context": "https://schema.org",
        "@type": "HomeGoodsStore",
        "@id": "https://www.mittalcollections.com/#business",
        name: "Mittal Collections",
        url: "https://www.mittalcollections.com/",
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
          { "@type": "Place", name: "Vasundhara, Ghaziabad" },
          { "@type": "Place", name: "Indirapuram, Ghaziabad" },
          { "@type": "Place", name: "Vaishali, Ghaziabad" },
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
        title="Home Furnishing Store in Vasundhara, Ghaziabad"
        description="Shop premium bedsheets, curtains, towels, pillows, cushions and blankets at Mittal Collections — Sector 3, Vasundhara, Ghaziabad. Serving Indirapuram, Vaishali and nearby areas."
        url="https://www.mittalcollections.com/"
        jsonLd={localBusinessJsonLd}
      />
      <Hero />
      <CategoryQuickLinks />
      <TrustBar />

      {/* Plain internal link (not a full carousel section) so the
          /hotel-collection page has an internal link pointing to it —
          without one, it's an orphan page Google has no easy way to
          discover/crawl. The page itself carries the SEO value; this
          is just how it gets found. */}
      <div className="text-center py-4">
        <Link
          to="/hotel-collection"
          className="text-sm font-medium text-amber-700 hover:text-amber-800 underline underline-offset-2"
        >
          Shop our Hotel-Style Bedsheets Collection
        </Link>
      </div>

      <RecentlyViewed />
      <Categories />
      <TrendingSection />
      <SizeShowcase />
      <PriceShowcase />
      <NewArrivals />
      <WhyChooseUs />
      <Testimonials />
      <Faq />
      <Newsletter />
    </>
  );
}

export default Home;
