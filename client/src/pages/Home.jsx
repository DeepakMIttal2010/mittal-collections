import { useEffect, useState } from "react";

import Seo from "../components/Seo";
import Hero from "../components/Hero/Hero";
import CategoryQuickLinks from "../components/CategoryQuickLinks/CategoryQuickLinks";
import TrustBar from "../components/TrustBar/TrustBar";
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
        title="Buy Bedsheets, Curtains & Towels Online — Pan-India Delivery"
        description="Shop premium cotton bedsheets, curtains, towels, cushions and doormats online with pan-India delivery — fast 24-hour delivery in Vasundhara, Indirapuram, Vaishali and nearby Ghaziabad. Genuine products, easy returns."
        url="https://www.mittalcollections.com/"
        jsonLd={localBusinessJsonLd}
      />
      <Hero />
      <CategoryQuickLinks />
      <TrustBar />
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
