import Header from "../components/Header/Header";
import Navbar from "../components/Navbar/Navbar";
import Hero from "../components/Hero/Hero";
import Features from "../components/Features/Features";
import Categories from "../components/Categories/Categories";
import FeaturedProducts from "../components/FeaturedProducts/FeaturedProducts";
import OffersBanner from "../components/OffersBanner/OffersBanner";
import WhyChooseUs from "../components/WhyChooseUs/WhyChooseUs";

function Home() {
  return (
    <>
      <Header />
      <Navbar />
      <Hero />
      <Features />
      <Categories />
      <FeaturedProducts />
      <OffersBanner />
      <WhyChooseUs />
    </>
  );
}

export default Home;
