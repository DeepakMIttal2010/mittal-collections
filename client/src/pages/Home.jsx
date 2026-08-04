import Seo from "../components/Seo";
import Hero from "../components/Hero/Hero";
import TrustBar from "../components/TrustBar/TrustBar";
import Categories from "../components/Categories/Categories";
import TrendingSection from "../components/TrendingSection/TrendingSection";
import SizeShowcase from "../components/SubcategoryShowcase/SizeShowcase";
import PriceShowcase from "../components/PriceShowcase/PriceShowcase";
import WhyChooseUs from "../components/WhyChooseUs/WhyChooseUs";
import Testimonials from "../components/Testimonials/Testimonials";
import Newsletter from "../components/Newsletter/Newsletter";
import ProductSection from "../components/ProductSection/ProductSection";

function Home() {
  return (
    <>
      <Seo
        title="Premium Home Furnishing"
        description="Shop premium bedsheets, towels, curtains, pillows, cushions and blankets at Mittal Collections. Quality home furnishing for every corner of your home."
        url="https://mittal-collections-five.vercel.app/"
      />
      <Hero />
      <TrustBar />
      <Categories />
      <TrendingSection />
      <SizeShowcase />
      <PriceShowcase />
      <ProductSection />
      <WhyChooseUs />
      <Testimonials />
      <Newsletter />
    </>
  );
}

export default Home;
