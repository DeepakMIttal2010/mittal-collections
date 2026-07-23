import { Routes, Route } from "react-router-dom";

import Home from "../pages/Home";
import Bedsheets from "../pages/Bedsheets";
import Towels from "../pages/Towels";
import Curtains from "../pages/Curtains";
import Pillows from "../pages/Pillows";
import Blankets from "../pages/Blankets";
import Offers from "../pages/Offers";
import About from "../pages/About";
import Contact from "../pages/Contact";
import Cart from "../pages/Cart";
import Wishlist from "../pages/Wishlist";
import Login from "../pages/Login";
import Register from "../pages/Register";

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/bedsheets" element={<Bedsheets />} />
      <Route path="/towels" element={<Towels />} />
      <Route path="/curtains" element={<Curtains />} />
      <Route path="/pillows" element={<Pillows />} />
      <Route path="/blankets" element={<Blankets />} />
      <Route path="/offers" element={<Offers />} />
      <Route path="/about" element={<About />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/cart" element={<Cart />} />
      <Route path="/wishlist" element={<Wishlist />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
    </Routes>
  );
}

export default AppRoutes;
