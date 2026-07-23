import "./Navbar.css";
import { NavLink } from "react-router-dom";

function Navbar() {
  return (
    <nav className="navbar-custom">
      <div className="container">
        <NavLink to="/">Home</NavLink>

        <NavLink to="/bedsheets">Bedsheets</NavLink>

        <NavLink to="/towels">Towels</NavLink>

        <NavLink to="/curtains">Curtains</NavLink>

        <NavLink to="/pillows">Pillows</NavLink>

        <NavLink to="/blankets">Blankets</NavLink>

        <NavLink to="/offers">Offers</NavLink>

        <NavLink to="/about">About</NavLink>

        <NavLink to="/contact">Contact</NavLink>
      </div>
    </nav>
  );
}

export default Navbar;
