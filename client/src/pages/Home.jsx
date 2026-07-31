import Hero from "../components/Hero/Hero";
import Features from "../components/Features/Features";
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
      <Hero />
      <Features />
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
