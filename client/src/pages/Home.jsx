import Hero from "../components/Hero/Hero";
import Features from "../components/Features/Features";
import Categories from "../components/Categories/Categories";
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
      <ProductSection />
      <WhyChooseUs />
      <Testimonials />
      <Newsletter />
    </>
  );
}

export default Home;
