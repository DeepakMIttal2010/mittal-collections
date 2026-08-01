import dotenv from "dotenv";

import connectDB from "./config/db.js";

import Category from "./models/Category.js";
import Product from "./models/Product.js";
import State from "./models/State.js";
import Testimonial from "./models/Testimonial.js";
import Page from "./models/Page.js";
import FooterLink from "./models/FooterLink.js";
import Banner from "./models/Banner.js";
import PriceRange from "./models/PriceRange.js";
import Coupon from "./models/Coupon.js";

import categoriesData from "./data/categories.js";
import getProducts from "./data/products.js";
import statesData from "./data/states.js";
import testimonialsData from "./data/testimonials.js";
import pagesData from "./data/pages.js";
import footerLinksData from "./data/footerLinks.js";
import bannersData from "./data/banners.js";
import priceRangesData from "./data/priceRanges.js";
import couponsData from "./data/coupons.js";

dotenv.config();

await connectDB();

const importCategories = async () => {
  try {
    await Category.deleteMany();
    await Category.insertMany(categoriesData);

    console.log("✅ Categories Imported");
    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

const importProducts = async () => {
  try {
    await Product.deleteMany();

    // Read all categories from MongoDB
    const categories = await Category.find();

    // Create name -> ObjectId map
    const categoryMap = {};

    categories.forEach((category) => {
      categoryMap[category.name] = category._id;
    });

    // Generate products with correct category ObjectIds
    const products = getProducts(categoryMap);

    await Product.insertMany(products);

    console.log("✅ Products Imported Successfully");

    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

const importStates = async () => {
  try {
    await State.deleteMany();
    await State.insertMany(statesData);

    console.log("✅ States Imported");
    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

const importTestimonials = async () => {
  try {
    await Testimonial.deleteMany();
    await Testimonial.insertMany(testimonialsData);

    console.log("✅ Testimonials Imported");
    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

const importPages = async () => {
  try {
    await Page.deleteMany();
    await Page.insertMany(pagesData);

    console.log("✅ Pages Imported");
    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

const importFooterLinks = async () => {
  try {
    await FooterLink.deleteMany();
    await FooterLink.insertMany(footerLinksData);

    console.log("✅ Footer Links Imported");
    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

const importBanners = async () => {
  try {
    await Banner.deleteMany();
    await Banner.insertMany(bannersData);

    console.log("✅ Banners Imported");
    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

const importPriceRanges = async () => {
  try {
    await PriceRange.deleteMany();
    await PriceRange.insertMany(priceRangesData);

    console.log("✅ Price Ranges Imported");
    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

const importCoupons = async () => {
  try {
    await Coupon.deleteMany();
    await Coupon.insertMany(couponsData);

    console.log("✅ Coupons Imported");
    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

const importAll = async () => {
  try {
    await Category.deleteMany();
    await Product.deleteMany();
    await State.deleteMany();
    await Testimonial.deleteMany();
    await Page.deleteMany();
    await FooterLink.deleteMany();
    await Banner.deleteMany();
    await PriceRange.deleteMany();
    await Coupon.deleteMany();

    const categories = await Category.insertMany(categoriesData);

    const categoryMap = {};

    categories.forEach((category) => {
      categoryMap[category.name] = category._id;
    });

    const products = getProducts(categoryMap);

    await Product.insertMany(products);
    await State.insertMany(statesData);
    await Testimonial.insertMany(testimonialsData);
    await Page.insertMany(pagesData);
    await FooterLink.insertMany(footerLinksData);
    await Banner.insertMany(bannersData);
    await PriceRange.insertMany(priceRangesData);
    await Coupon.insertMany(couponsData);

    console.log("✅ Categories Imported");
    console.log("✅ Products Imported");
    console.log("✅ States Imported");
    console.log("✅ Testimonials Imported");
    console.log("✅ Pages Imported");
    console.log("✅ Footer Links Imported");
    console.log("✅ Banners Imported");
    console.log("✅ Price Ranges Imported");
    console.log("✅ Coupons Imported");

    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

const destroyAll = async () => {
  try {
    await Category.deleteMany();
    await Product.deleteMany();
    await State.deleteMany();
    await Testimonial.deleteMany();
    await Page.deleteMany();
    await FooterLink.deleteMany();
    await Banner.deleteMany();
    await PriceRange.deleteMany();
    await Coupon.deleteMany();

    console.log("🗑 Database Cleared");

    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

const command = process.argv[2];

switch (command) {
  case "categories":
    importCategories();
    break;

  case "products":
    importProducts();
    break;

  case "states":
    importStates();
    break;

  case "testimonials":
    importTestimonials();
    break;

  case "pages":
    importPages();
    break;

  case "footer-links":
    importFooterLinks();
    break;

  case "banners":
    importBanners();
    break;

  case "price-ranges":
    importPriceRanges();
    break;

  case "coupons":
    importCoupons();
    break;

  case "all":
    importAll();
    break;

  case "destroy":
    destroyAll();
    break;

  default:
    console.log(`
Usage:

node seeder.js categories
node seeder.js products
node seeder.js states
node seeder.js testimonials
node seeder.js pages
node seeder.js footer-links
node seeder.js banners
node seeder.js price-ranges
node seeder.js coupons
node seeder.js all
node seeder.js destroy
`);
    process.exit();
}
