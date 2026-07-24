import "./Footer.css";
import {
  FaFacebookF,
  FaInstagram,
  FaTwitter,
  FaLinkedinIn,
} from "react-icons/fa";

function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-column">
            <h3>Mittal Collections</h3>

            <p>
              Premium home furnishing products designed to bring elegance and
              comfort to your home.
            </p>
          </div>

          <div className="footer-column">
            <h3>Quick Links</h3>

            <ul>
              <li>Home</li>
              <li>Bedsheets</li>
              <li>Curtains</li>
              <li>Towels</li>
              <li>Contact</li>
            </ul>
          </div>

          <div className="footer-column">
            <h3>Customer Care</h3>

            <ul>
              <li>Shipping Policy</li>
              <li>Returns</li>
              <li>Privacy Policy</li>
              <li>Terms & Conditions</li>
            </ul>
          </div>

          <div className="footer-column">
            <h3>Follow Us</h3>

            <div className="social-icons">
              <a href="#">
                <FaFacebookF />
              </a>
              <a href="#">
                <FaInstagram />
              </a>
              <a href="#">
                <FaTwitter />
              </a>
              <a href="#">
                <FaLinkedinIn />
              </a>
            </div>
          </div>
        </div>

        <hr />

        <p className="copyright">
          © 2026 Mittal Collections. All Rights Reserved.
        </p>
      </div>
    </footer>
  );
}

export default Footer;
