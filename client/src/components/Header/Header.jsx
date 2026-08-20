import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FaUser,
  FaHeart,
  FaShoppingCart,
  FaMicrophone,
  FaMapMarkerAlt,
  FaBell,
  FaDownload,
  FaChevronDown,
} from "react-icons/fa";

import { getCategories } from "../../services/categoryService";
import { useCart } from "../../context/CartContext";
import { useWishlist } from "../../context/WishlistContext";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { useInstallPrompt } from "../../hooks/useInstallPrompt";
import { getSearchSuggestions } from "../../services/productService";
import { getMyLocation } from "../../services/analyticsService";
import {
  getAddresses,
  setDefaultAddress,
} from "../../services/addressService";
import {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../../services/notificationService";
import { imgUrl } from "../../services/api";
import { productUrl } from "../../utils/productUrl";
import { notifyDefaultAddressChanged } from "../../utils/addressEvents";

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
  const { language, setLanguage, t } = useLanguage();
  const { showIcon: showInstallIcon, canPromptNatively, promptInstall } =
    useInstallPrompt();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [searchCategory, setSearchCategory] = useState("");
  const [categories, setCategories] = useState([]);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const categoryMenuRef = useRef(null);
  const [mobileCategoryMenuOpen, setMobileCategoryMenuOpen] = useState(false);
  const mobileCategoryMenuRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [deliverName, setDeliverName] = useState("");
  const [deliverPlace, setDeliverPlace] = useState("");
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [addressOpen, setAddressOpen] = useState(false);
  const [switchingAddressId, setSwitchingAddressId] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    getCategories().then((response) => {
      if (response.success) {
        setCategories(
          [...response.categories].sort((a, b) => a.name.localeCompare(b.name)),
        );
      }
    });
  }, []);

  useEffect(() => {
    if (!categoryMenuOpen) return;

    const handleClickOutside = (e) => {
      if (
        categoryMenuRef.current &&
        !categoryMenuRef.current.contains(e.target)
      ) {
        setCategoryMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [categoryMenuOpen]);

  useEffect(() => {
    if (!mobileCategoryMenuOpen) return;

    const handleClickOutside = (e) => {
      if (
        mobileCategoryMenuRef.current &&
        !mobileCategoryMenuRef.current.contains(e.target)
      ) {
        setMobileCategoryMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mobileCategoryMenuOpen]);

  const selectedCategoryName =
    categories.find((c) => c._id === searchCategory)?.name || "All";

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

  const handleInstallClick = async () => {
    if (canPromptNatively) {
      await promptInstall();
      return;
    }

    // No `beforeinstallprompt` yet (Chrome hasn't decided to offer it) or
    // never will (iOS Safari has no such API) — the icon still stays
    // visible per the "always there when not installed" ask, so give
    // people the manual path instead of doing nothing on click.
    setShowInstallHelp(true);
  };

  // Always a "Deliver to [Name] / [Place]" pair — the real name + saved
  // address for logged-in customers, "Guest" + a geo-IP guess otherwise.
  // The place always resolves to something concrete (our own home city +
  // pincode as the last resort) rather than a bare "India". Also keeps
  // the full address list around so the dropdown can offer a real pick
  // -a-different-address action instead of just linking to /addresses.
  const loadDeliverTo = useCallback(async () => {
    if (isLoggedIn) {
      const response = await getAddresses();

      if (response.success && response.addresses.length > 0) {
        setSavedAddresses(response.addresses);

        const address =
          response.addresses.find((a) => a.isDefault) ||
          response.addresses[0];

        // The address's own recipient name, not the account holder's —
        // an office/gift address can genuinely have a different name on
        // it than whoever is logged in.
        setDeliverName(address.fullName || user?.name || "");
        setDeliverPlace(
          [address.city, address.pincode].filter(Boolean).join(" "),
        );
        return;
      }

      setSavedAddresses([]);
    }

    const response = await getMyLocation();

    // City-level geo data isn't available for every IP on the free
    // database — fall back to state, then our home city, rather than
    // showing nothing.
    const { city, region } = response.location || {};

    setDeliverName(isLoggedIn ? user?.name || "" : "Guest");
    if (city) setDeliverPlace(city);
    else if (region) setDeliverPlace(region);
    else setDeliverPlace("Ghaziabad 201012");
  }, [isLoggedIn, user]);

  useEffect(() => {
    loadDeliverTo();
  }, [loadDeliverTo]);

  const handleSelectAddress = async (address) => {
    if (address.isDefault) {
      setAddressOpen(false);
      return;
    }

    setSwitchingAddressId(address._id);
    const response = await setDefaultAddress(address._id);
    setSwitchingAddressId(null);

    if (response.success) {
      await loadDeliverTo();
      notifyDefaultAddressChanged();
    }

    setAddressOpen(false);
  };

  const goToSearch = useCallback(
    (value, categoryId = searchCategory) => {
      const trimmed = value.trim();
      setShowSuggestions(false);

      if (!trimmed) {
        // No search text — if a category is picked, "Go" should behave
        // like browsing that category rather than doing nothing.
        if (!categoryId) return;
        const category = categories.find((c) => c._id === categoryId);
        if (category) navigate(`/category/${category.slug}`);
        return;
      }

      const params = new URLSearchParams({ q: trimmed });
      if (categoryId) params.set("category", categoryId);

      navigate(`/search?${params.toString()}`);
    },
    [navigate, searchCategory, categories],
  );

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      const response = await getSearchSuggestions(trimmed, searchCategory);
      if (response.success) setSuggestions(response.products);
    }, 250);

    return () => clearTimeout(timeout);
  }, [query, searchCategory]);

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
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3 sm:gap-8">
        {/* Logo */}
        <Link to="/" className="shrink-0">
          <h2 className="text-base sm:text-2xl font-bold sm:tracking-wide text-slate-800 whitespace-nowrap">
            MITTAL <span className="text-amber-600">COLLECTIONS</span>
          </h2>
        </Link>

        {/* Delivery location — saved address if logged in, else an IP-based guess */}
        {deliverPlace &&
          (isLoggedIn && savedAddresses.length > 0 ? (
            <div
              className="relative hidden lg:block shrink-0"
              onMouseEnter={() => setAddressOpen(true)}
              onMouseLeave={() => setAddressOpen(false)}
            >
              <button
                type="button"
                className="flex items-start gap-1.5 leading-tight"
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
              </button>

              {addressOpen && (
                <div className="absolute top-full left-0 z-50 mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-lg py-2">
                  <div className="px-4 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Choose delivery address
                  </div>

                  {savedAddresses.map((address) => (
                    <button
                      key={address._id}
                      type="button"
                      onClick={() => handleSelectAddress(address)}
                      disabled={switchingAddressId === address._id}
                      className={`w-full flex items-start gap-2 px-4 py-2 text-left hover:bg-slate-50 disabled:opacity-60 ${
                        address.isDefault ? "bg-amber-50/60" : ""
                      }`}
                    >
                      <FaMapMarkerAlt
                        className={`mt-1 text-sm shrink-0 ${
                          address.isDefault
                            ? "text-amber-600"
                            : "text-slate-300"
                        }`}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-800 truncate">
                          {address.fullName}
                          {address.isDefault && (
                            <span className="ml-1.5 text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded align-middle">
                              Current
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-slate-500 truncate">
                          {[address.city, address.pincode]
                            .filter(Boolean)
                            .join(" ")}
                        </span>
                      </span>
                    </button>
                  ))}

                  <div className="border-t border-slate-100 mt-1 pt-1">
                    <Link
                      to="/addresses/add"
                      onClick={() => setAddressOpen(false)}
                      className="block px-4 py-2 text-sm font-medium text-blue-700 hover:bg-slate-50"
                    >
                      + Add New Address
                    </Link>
                    <Link
                      to="/addresses"
                      onClick={() => setAddressOpen(false)}
                      className="block px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-amber-600"
                    >
                      Manage Addresses
                    </Link>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              to={isLoggedIn ? "/addresses/add" : "/login"}
              className="hidden lg:flex items-start gap-1.5 shrink-0 leading-tight"
            >
              <FaMapMarkerAlt className="text-amber-600 mt-1 text-base shrink-0" />
              {deliverName ? (
                <span>
                  <span className="block text-xs text-slate-500">
                    Deliver to {deliverName}
                  </span>
                  <span className="block text-sm font-bold text-slate-900">
                    {deliverPlace}
                  </span>
                </span>
              ) : (
                <span className="text-sm font-bold text-slate-900">
                  Deliver to: {deliverPlace}
                </span>
              )}
            </Link>
          ))}

        {/* Search */}
        <form
          onSubmit={handleSearchSubmit}
          className="relative flex-1 max-w-2xl mx-auto hidden md:flex"
        >
          <div className="w-full flex items-center border border-slate-300 rounded-full pr-1.5 py-1.5">
            <div className="relative shrink-0" ref={categoryMenuRef}>
              <button
                type="button"
                onClick={() => setCategoryMenuOpen((prev) => !prev)}
                aria-label="Search category"
                aria-expanded={categoryMenuOpen}
                className="flex items-center gap-1 h-full bg-slate-100 rounded-l-full text-xs font-medium text-slate-600 border-r border-slate-300 pl-4 pr-2.5 py-2 hover:bg-slate-200 transition-colors"
              >
                <span className="max-w-[70px] truncate">
                  {selectedCategoryName}
                </span>
                <FaChevronDown className="text-[9px] shrink-0" />
              </button>

              {categoryMenuOpen && (
                <div className="absolute top-full left-0 mt-1 w-52 max-h-80 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSearchCategory("");
                      setCategoryMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm ${
                      searchCategory === ""
                        ? "bg-blue-700 text-white font-semibold"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    All Categories
                  </button>

                  {categories.map((c) => (
                    <button
                      key={c._id}
                      type="button"
                      onClick={() => {
                        setSearchCategory(c._id);
                        setCategoryMenuOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm ${
                        searchCategory === c._id
                          ? "bg-blue-700 text-white font-semibold"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Search Bedsheets, Towels, Curtains..."
              className="flex-1 min-w-0 outline-none text-sm text-slate-700 placeholder:text-slate-400 pl-3"
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
        <div className="flex items-center gap-1 sm:gap-6 ml-auto shrink-0">
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

          {showInstallIcon && (
            <div
              className="relative"
              onMouseLeave={() => setShowInstallHelp(false)}
            >
              <button
                type="button"
                onClick={handleInstallClick}
                aria-label="Install the Mittal Collections app"
                title="Install App"
                className="flex flex-col items-center text-slate-600 hover:text-blue-700 transition-colors"
              >
                <FaDownload className="text-lg" />
                <span className="hidden sm:block text-xs mt-0.5">
                  Install
                </span>
              </button>

              {showInstallHelp && (
                <div className="absolute top-full right-0 z-50 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs text-slate-600 leading-relaxed">
                  Apne browser ke menu se{" "}
                  <strong>&quot;Add to Home Screen&quot;</strong> ya{" "}
                  <strong>&quot;Install App&quot;</strong> option chunein.
                  <button
                    type="button"
                    onClick={() => setShowInstallHelp(false)}
                    className="block mt-2 text-blue-700 font-medium hover:underline"
                  >
                    Got it
                  </button>
                </div>
              )}
            </div>
          )}

          {isLoggedIn ? (
            <div
              className="hidden md:block relative"
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
                <span className="hidden sm:block text-xs mt-0.5">Account</span>
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
              className="hidden md:flex flex-col items-center text-slate-600 hover:text-blue-700 transition-colors"
            >
              <FaUser className="text-lg" />
              <span className="hidden sm:block text-xs mt-0.5">Account</span>
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
                <span className="hidden sm:block text-xs mt-0.5">Alerts</span>
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
            <span className="hidden sm:block text-xs mt-0.5">Wishlist</span>
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
            <span className="hidden sm:block text-xs mt-0.5">Cart</span>
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
        <div className="flex items-center border border-slate-300 rounded-full pr-1.5 py-1.5">
          <div className="relative shrink-0" ref={mobileCategoryMenuRef}>
            <button
              type="button"
              onClick={() => setMobileCategoryMenuOpen((prev) => !prev)}
              aria-label="Search category"
              aria-expanded={mobileCategoryMenuOpen}
              className="flex items-center gap-1 h-full bg-slate-100 rounded-l-full text-xs font-medium text-slate-600 border-r border-slate-300 pl-3 pr-1.5 py-2"
            >
              <span className="max-w-[52px] truncate">
                {selectedCategoryName}
              </span>
              <FaChevronDown className="text-[9px] shrink-0" />
            </button>

            {mobileCategoryMenuOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
                <button
                  type="button"
                  onClick={() => {
                    setSearchCategory("");
                    setMobileCategoryMenuOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm ${
                    searchCategory === ""
                      ? "bg-blue-700 text-white font-semibold"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  All Categories
                </button>

                {categories.map((c) => (
                  <button
                    key={c._id}
                    type="button"
                    onClick={() => {
                      setSearchCategory(c._id);
                      setMobileCategoryMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm ${
                      searchCategory === c._id
                        ? "bg-blue-700 text-white font-semibold"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Search products..."
            className="flex-1 min-w-0 outline-none text-sm text-slate-700 placeholder:text-slate-400 pl-3"
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
