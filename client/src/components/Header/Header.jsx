import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FaUser,
  FaHeart,
  FaShoppingCart,
  FaMicrophone,
  FaMapMarkerAlt,
  FaBell,
} from "react-icons/fa";

import { useCart } from "../../context/CartContext";
import { useWishlist } from "../../context/WishlistContext";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { getSearchSuggestions } from "../../services/productService";
import { getMyLocation } from "../../services/analyticsService";
import { getAddresses } from "../../services/addressService";
import {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../../services/notificationService";
import { imgUrl } from "../../services/api";
import { productUrl } from "../../utils/productUrl";

const NOTIFICATION_POLL_MS = 30000;

const timeAgo = (dateString) => {
  const seconds = Math.floor((Date.now() - new Date(dateString)) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

function Header() {
  const { totalItems, openCart } = useCart();
  const { totalWishlistItems } = useWishlist();
  const { user, logout, isLoggedIn } = useAuth();
  const { language, setLanguage } = useLanguage();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [listening, setListening] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [deliverName, setDeliverName] = useState("");
  const [deliverPlace, setDeliverPlace] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const recognitionRef = useRef(null);

  const loadNotifications = useCallback(async () => {
    const response = await getMyNotifications();

    if (response.success) {
      setNotifications(response.notifications);
      setUnreadCount(response.unreadCount);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    loadNotifications();

    const interval = setInterval(loadNotifications, NOTIFICATION_POLL_MS);
    return () => clearInterval(interval);
  }, [isLoggedIn, loadNotifications]);

  const handleNotificationClick = async (item) => {
    setShowNotifications(false);
    if (!item.isRead) await markNotificationRead(item._id);
    loadNotifications();
    if (item.link) navigate(item.link);
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    loadNotifications();
  };

  // Prefer the customer's own saved (default) address — real name, city
  // and pincode. Only fall back to an IP-based city guess when logged
  // out or when they haven't saved an address yet.
  useEffect(() => {
    const loadDeliverTo = async () => {
      if (isLoggedIn) {
        const response = await getAddresses();

        if (response.success && response.addresses.length > 0) {
          const address =
            response.addresses.find((a) => a.isDefault) ||
            response.addresses[0];

          setDeliverName(user?.name || "");
          setDeliverPlace(
            [address.city, address.pincode].filter(Boolean).join(" "),
          );
          return;
        }
      }

      const response = await getMyLocation();

      if (!response.success || !response.location) return;

      // City-level geo data isn't available for every IP on the free
      // database — fall back to state, then just "India", rather than
      // showing nothing.
      const { city, region, country } = response.location;

      setDeliverName(isLoggedIn ? user?.name || "" : "Guest");
      if (city) setDeliverPlace(city);
      else if (region) setDeliverPlace(region);
      else if (country === "IN") setDeliverPlace("India");
    };

    loadDeliverTo();
  }, [isLoggedIn, user]);

  const goToSearch = useCallback(
    (value) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      setShowSuggestions(false);
      navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    },
    [navigate],
  );

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      const response = await getSearchSuggestions(trimmed);
      if (response.success) setSuggestions(response.products);
    }, 250);

    return () => clearTimeout(timeout);
  }, [query]);

  const handleSuggestionClick = (product) => {
    setShowSuggestions(false);
    setQuery("");
    navigate(productUrl(product));
  };

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setQuery(transcript);
      goToSearch(transcript);
    };

    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
  }, [goToSearch]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    goToSearch(query);
  };

  const handleMicClick = () => {
    if (!recognitionRef.current) {
      alert("Voice search is not supported in this browser.");
      return;
    }

    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    setListening(true);
    recognitionRef.current.start();
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-8">
        {/* Logo */}
        <Link to="/" className="shrink-0">
          <h2 className="text-2xl font-bold tracking-wide text-slate-800">
            MITTAL <span className="text-amber-600">COLLECTIONS</span>
          </h2>
        </Link>

        {/* Delivery location — saved address if logged in, else an IP-based guess */}
        {deliverPlace && (
          <Link
            to={isLoggedIn ? "/addresses" : "/login"}
            className="hidden lg:flex items-start gap-1.5 shrink-0 leading-tight"
          >
            <FaMapMarkerAlt className="text-amber-600 mt-1 text-base shrink-0" />
            <span>
              <span className="block text-xs text-slate-500">
                Deliver to {deliverName}
              </span>
              <span className="block text-sm font-bold text-slate-900">
                {deliverPlace}
              </span>
            </span>
          </Link>
        )}

        {/* Search */}
        <form
          onSubmit={handleSearchSubmit}
          className="relative flex-1 max-w-2xl mx-auto hidden md:flex"
        >
          <div className="w-full flex items-center border border-slate-300 rounded-full overflow-hidden pl-5 pr-1.5 py-1.5">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Search Bedsheets, Towels, Curtains..."
              className="flex-1 outline-none text-sm text-slate-700 placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={handleMicClick}
              title={listening ? "Listening..." : "Search by voice"}
              className="p-1"
            >
              <FaMicrophone
                className={`mx-2 ${
                  listening ? "text-red-500 animate-pulse" : "text-slate-400"
                }`}
              />
            </button>
            <button
              type="submit"
              className="bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-5 py-2 rounded-full transition-colors"
            >
              Go
            </button>
          </div>

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
              {suggestions.map((product) => (
                <button
                  key={product._id}
                  type="button"
                  onClick={() => handleSuggestionClick(product)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left"
                >
                  <img
                    src={imgUrl(product.image)}
                    alt={t(product.name, product.nameHi)}
                    className="w-10 h-10 rounded-lg object-cover shrink-0"
                  />
                  <span className="flex-1 text-sm text-slate-700 truncate">
                    {t(product.name, product.nameHi)}
                  </span>
                  <span className="text-sm font-medium text-slate-500">
                    ₹{product.price}
                  </span>
                </button>
              ))}
            </div>
          )}
        </form>

        {/* Right Icons */}
        <div className="flex items-center gap-6 ml-auto">
          {/* Language toggle */}
          <div className="flex items-center rounded-full border border-slate-200 text-xs font-medium overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => setLanguage("en")}
              className={`px-2.5 py-1 transition-colors ${
                language === "en"
                  ? "bg-amber-600 text-white"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLanguage("hi")}
              className={`px-2.5 py-1 transition-colors ${
                language === "hi"
                  ? "bg-amber-600 text-white"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              हिं
            </button>
          </div>

          {isLoggedIn ? (
            <div
              className="relative"
              onMouseEnter={() => setAccountOpen(true)}
              onMouseLeave={() => setAccountOpen(false)}
            >
              <button
                type="button"
                className="flex flex-col items-center text-slate-600 hover:text-blue-700 transition-colors"
              >
                <span className="w-7 h-7 rounded-full bg-amber-600 text-white text-sm font-semibold flex items-center justify-center">
                  {user?.name?.charAt(0).toUpperCase()}
                </span>
                <span className="text-xs mt-0.5">Account</span>
              </button>

              {accountOpen && (
                <div className="absolute top-full right-0 z-50 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg py-2">
                  <div className="px-4 py-2 text-sm text-slate-500 border-b border-slate-100 truncate">
                    Hi, {user?.name}
                  </div>

                  <Link
                    to="/account"
                    className="block px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 hover:text-amber-600"
                  >
                    My Account
                  </Link>

                  <Link
                    to="/my-orders"
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-amber-600"
                  >
                    My Orders
                  </Link>

                  <Link
                    to="/wishlist"
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-amber-600"
                  >
                    Wishlist
                  </Link>

                  <Link
                    to="/change-password"
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-amber-600"
                  >
                    Change Password
                  </Link>

                  <button
                    type="button"
                    onClick={logout}
                    className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-slate-50"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              to="/login"
              className="flex flex-col items-center text-slate-600 hover:text-blue-700 transition-colors"
            >
              <FaUser className="text-lg" />
              <span className="text-xs mt-0.5">Account</span>
            </Link>
          )}

          {isLoggedIn && (
            <div
              className="relative"
              onMouseEnter={() => setShowNotifications(true)}
              onMouseLeave={() => setShowNotifications(false)}
            >
              <button
                type="button"
                className="relative flex flex-col items-center text-slate-600 hover:text-blue-700 transition-colors"
              >
                <FaBell className="text-lg" />
                <span className="text-xs mt-0.5">Alerts</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute top-full right-0 z-50 mt-1 w-80 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <h4 className="font-semibold text-slate-800 text-sm">
                      Notifications
                    </h4>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-xs font-medium text-blue-700 hover:underline"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-8">
                        No notifications yet
                      </p>
                    ) : (
                      notifications.map((item) => (
                        <button
                          key={item._id}
                          onClick={() => handleNotificationClick(item)}
                          className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-50 last:border-b-0 ${
                            item.isRead ? "" : "bg-blue-50/40"
                          }`}
                        >
                          <span
                            className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                              item.isRead ? "bg-transparent" : "bg-blue-600"
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-800 truncate">
                              {item.title}
                            </p>
                            {item.message && (
                              <p className="text-xs text-slate-500 truncate">
                                {item.message}
                              </p>
                            )}
                          </div>
                          <span className="text-xs text-slate-400 shrink-0">
                            {timeAgo(item.createdAt)}
                          </span>
                        </button>
                      ))
                    )}
                  </div>

                  <Link
                    to="/notifications"
                    onClick={() => setShowNotifications(false)}
                    className="block text-center text-xs font-medium text-blue-700 hover:underline py-2.5 border-t border-slate-100"
                  >
                    View all notifications
                  </Link>
                </div>
              )}
            </div>
          )}

          <Link
            to="/wishlist"
            className="relative flex flex-col items-center text-slate-600 hover:text-blue-700 transition-colors"
          >
            <FaHeart className="text-lg" />
            <span className="text-xs mt-0.5">Wishlist</span>
            {totalWishlistItems > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {totalWishlistItems}
              </span>
            )}
          </Link>

          <button
            type="button"
            onClick={openCart}
            className="relative flex flex-col items-center text-slate-600 hover:text-blue-700 transition-colors"
          >
            <FaShoppingCart className="text-lg" />
            <span className="text-xs mt-0.5">Cart</span>
            {totalItems > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {totalItems}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Mobile search (shows below on small screens) */}
      <form onSubmit={handleSearchSubmit} className="relative px-4 pb-3 md:hidden">
        <div className="flex items-center border border-slate-300 rounded-full overflow-hidden pl-4 pr-1.5 py-1.5">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Search products..."
            className="flex-1 outline-none text-sm text-slate-700 placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={handleMicClick}
            title={listening ? "Listening..." : "Search by voice"}
            className="p-1"
          >
            <FaMicrophone
              className={`mx-2 ${
                listening ? "text-red-500 animate-pulse" : "text-slate-400"
              }`}
            />
          </button>
          <button
            type="submit"
            className="bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-4 py-1.5 rounded-full"
          >
            Go
          </button>
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-4 right-4 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
            {suggestions.map((product) => (
              <button
                key={product._id}
                type="button"
                onClick={() => handleSuggestionClick(product)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left"
              >
                <img
                  src={imgUrl(product.image)}
                  alt={t(product.name, product.nameHi)}
                  className="w-10 h-10 rounded-lg object-cover shrink-0"
                />
                <span className="flex-1 text-sm text-slate-700 truncate">
                  {t(product.name, product.nameHi)}
                </span>
                <span className="text-sm font-medium text-slate-500">
                  ₹{product.price}
                </span>
              </button>
            ))}
          </div>
        )}
      </form>
    </header>
  );
}

export default Header;
