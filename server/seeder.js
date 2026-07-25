import dotenv from "dotenv";

import connectDB from "./config/db.js";

import Category from "./models/Category.js";
import Product from "./models/Product.js";

import categories from "./data/categories.js";
import products from "./data/products.js";

dotenv.config();

await connectDB();

const importCategories = async () => {
  try {
    await Category.deleteMany();
    await Category.insertMany(categories);

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
    await Product.insertMany(products);

    console.log("✅ Products Imported");
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

    await Category.insertMany(categories);
    await Product.insertMany(products);

    console.log("✅ Categories Imported");
    console.log("✅ Products Imported");

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
node seeder.js all
node seeder.js destroy
`);
    process.exit();
}
