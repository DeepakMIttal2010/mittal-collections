import bedsheet1 from "../assets/images/products/bedsheet-1.jpg";
import towel1 from "../assets/images/products/towel-1.jpg";
import curtain1 from "../assets/images/products/curtain-1.jpg";
import pillow1 from "../assets/images/products/pillow-1.jpg";

const products = [
  {
    id: 1,
    name: "Luxury Cotton Bedsheet",
    category: "Bedsheets",
    image: bedsheet1,
    price: 1999,
    oldPrice: 2499,
    rating: 4.8,
  },
  {
    id: 2,
    name: "Premium Bath Towel",
    category: "Towels",
    image: towel1,
    price: 699,
    oldPrice: 899,
    rating: 4.7,
  },
  {
    id: 3,
    name: "Elegant Curtain",
    category: "Curtains",
    image: curtain1,
    price: 1599,
    oldPrice: 1999,
    rating: 4.9,
  },
  {
    id: 4,
    name: "Soft Pillow",
    category: "Pillows",
    image: pillow1,
    price: 799,
    oldPrice: 999,
    rating: 4.6,
  },
];

export default products;
