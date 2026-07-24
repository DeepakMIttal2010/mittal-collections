// Bedsheets
import bedsheet1 from "../assets/images/products/bedsheet-1.jpg";
import bedsheet2 from "../assets/images/products/bedsheet-2.jpg";
import bedsheet3 from "../assets/images/products/bedsheet-3.jpg";

// Curtains
import curtain1 from "../assets/images/products/curtain-1.jpg";
import curtain2 from "../assets/images/products/curtain-2.jpg";

// Towels
import towel1 from "../assets/images/products/towel-1.jpg";
import towel2 from "../assets/images/products/towel-2.jpg";

// Cushions
import cushion1 from "../assets/images/products/cushion-1.jpg";
import cushion2 from "../assets/images/products/cushion-2.jpg";

// Blankets
import blanket1 from "../assets/images/products/blanket-1.jpg";
import blanket2 from "../assets/images/products/blanket-2.jpg";

// Pillow
import pillow1 from "../assets/images/products/pillow-1.jpg";

const products = [
  {
    id: 1,
    name: "Luxury Cotton Bedsheet",
    category: "Bedsheets",
    price: 1499,
    oldPrice: 1999,
    rating: 4.8,
    stock: 25,
    featured: true,
    image: bedsheet1,
  },
  {
    id: 2,
    name: "Floral Bedsheet",
    category: "Bedsheets",
    price: 1699,
    oldPrice: 2199,
    rating: 4.7,
    stock: 18,
    featured: true,
    image: bedsheet2,
  },
  {
    id: 3,
    name: "Premium Hotel Bedsheet",
    category: "Bedsheets",
    price: 1899,
    oldPrice: 2499,
    rating: 4.9,
    stock: 15,
    featured: true,
    image: bedsheet3,
  },
  {
    id: 4,
    name: "Modern Living Curtain",
    category: "Curtains",
    price: 1299,
    oldPrice: 1699,
    rating: 4.6,
    stock: 22,
    featured: true,
    image: curtain1,
  },
  {
    id: 5,
    name: "Luxury Window Curtain",
    category: "Curtains",
    price: 1499,
    oldPrice: 1999,
    rating: 4.8,
    stock: 20,
    featured: false,
    image: curtain2,
  },
  {
    id: 6,
    name: "Premium Bath Towel",
    category: "Towels",
    price: 599,
    oldPrice: 799,
    rating: 4.7,
    stock: 40,
    featured: true,
    image: towel1,
  },
  {
    id: 7,
    name: "Cotton Towel Set",
    category: "Towels",
    price: 899,
    oldPrice: 1199,
    rating: 4.8,
    stock: 35,
    featured: false,
    image: towel2,
  },
  {
    id: 8,
    name: "Decorative Cushion",
    category: "Cushions",
    price: 699,
    oldPrice: 999,
    rating: 4.6,
    stock: 28,
    featured: true,
    image: cushion1,
  },
  {
    id: 9,
    name: "Luxury Sofa Cushion",
    category: "Cushions",
    price: 799,
    oldPrice: 1099,
    rating: 4.9,
    stock: 18,
    featured: false,
    image: cushion2,
  },
  {
    id: 10,
    name: "Winter Blanket",
    category: "Blankets",
    price: 2199,
    oldPrice: 2899,
    rating: 4.9,
    stock: 12,
    featured: true,
    image: blanket1,
  },
  {
    id: 11,
    name: "Premium Fleece Blanket",
    category: "Blankets",
    price: 2499,
    oldPrice: 3199,
    rating: 4.8,
    stock: 10,
    featured: false,
    image: blanket2,
  },
  {
    id: 12,
    name: "Soft Sleeping Pillow",
    category: "Pillows",
    price: 999,
    oldPrice: 1299,
    rating: 4.7,
    stock: 30,
    featured: true,
    image: pillow1,
  },
];

export default products;