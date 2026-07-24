import Header from "../components/Header/Header";
import Navbar from "../components/Navbar/Navbar";
import Hero from "../components/Hero/Hero";
import Features from "../components/Features/Features";
import Categories from "../components/Categories/Categories";
import FeaturedProducts from "../components/FeaturedProducts/FeaturedProducts";
import OffersBanner from "../components/OffersBanner/OffersBanner";
import WhyChooseUs from "../components/WhyChooseUs/WhyChooseUs";
import Testimonials from "../components/Testimonials/Testimonials";
import Newsletter from "../components/Newsletter/Newsletter";
import Footer from "../components/Footer/Footer";

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
      <Testimonials />
      <Newsletter />
      <Footer />
    </>
  );
}

export default Home;
