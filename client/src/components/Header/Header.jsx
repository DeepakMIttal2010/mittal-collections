import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  FaUser,
  FaShoppingCart,
  FaMicrophone,
  FaMapMarkerAlt,
  FaChevronDown,
} from "react-icons/fa";

import { getCategories } from "../../services/categoryService";
import { useCart } from "../../context/CartContext";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { useInstallPrompt } from "../../hooks/useInstallPrompt";
import { getSearchSuggestions } from "../../services/productService";
import { getMyLocation } from "../../services/analyticsService";
import {
  getAddresses,
  setDefaultAddress,
} from "../../services/addressService";
import { imgUrl } from "../../services/api";
import { productUrl } from "../../utils/productUrl";
import { notifyDefaultAddressChanged } from "../../utils/addressEvents";

function Header() {
  const { totalItems, openCart } = useCart();
  const { user, logout, isLoggedIn } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { canPromptNatively, promptInstall } = useInstallPrompt();
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
  const accountCloseTimer = useRef(null);

  // A zero-gap hover handoff between the trigger and its absolutely
  // positioned panel still isn't reliable — the panel sits outside the
  // trigger's own layout box, so the pointer can hit-test to nothing for
  // a frame while crossing between them, firing a real mouseleave. A
  // short close delay (cancelable by re-entering either element) absorbs
  // that gap, same fix as the MegaMenu dropdowns use.
  const openAccountMenu = () => {
    clearTimeout(accountCloseTimer.current);
    setAccountOpen(true);
  };
  const scheduleCloseAccountMenu = () => {
    accountCloseTimer.current = setTimeout(() => setAccountOpen(false), 150);
  };
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [deliverName, setDeliverName] = useState("");
  const [deliverPlace, setDeliverPlace] = useState("");
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [addressOpen, setAddressOpen] = useState(false);
  const [switchingAddressId, setSwitchingAddressId] = useState(null);
  const recognitionRef = useRef(null);
  const searchFormRef = useRef(null);
  const mobileSearchFormRef = useRef(null);

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
    categories.find((c) => c._id === searchCategory)?.name || t("All", "सभी");

  // Outside-click (not onBlur+setTimeout) to hide suggestions — onBlur
  // fires on mousedown, before the click event a suggestion button
  // needs, so on a slower click (real mouse/trackpad, not a synthetic
  // test click) the panel could unmount out from under the click and
  // eat it. This mirrors the category dropdown's own outside-click
  // pattern above, which doesn't have that race.
  useEffect(() => {
    if (!showSuggestions) return;

    const handleClickOutside = (e) => {
      const insideDesktop = searchFormRef.current?.contains(e.target);
      const insideMobile = mobileSearchFormRef.current?.contains(e.target);
      if (!insideDesktop && !insideMobile) setShowSuggestions(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSuggestions]);

  const handleInstallClick = async () => {
    if (canPromptNatively) {
      await promptInstall();
      return;
    }

    // No `beforeinstallprompt` yet (Chrome hasn't decided to offer it) or
    // never will (iOS Safari has no such API) — give people the manual
    // path via a toast instead of doing nothing on click.
    toast.info(
      t(
        'From your browser\'s menu, choose "Add to Home Screen" or "Install App".',
        'अपने ब्राउज़र के मेनू से "Add to Home Screen" या "Install App" चुनें।',
      ),
      { autoClose: 6000 },
    );
  };

  // The Recently Viewed section only exists on Home, and only once it
  // has products to show (it renders null while empty/loading — see
  // RecentlyViewed.jsx), so a plain `#recently-viewed` link can't rely
  // on the element already being there. Navigate first, then poll
  // briefly for the section to mount before scrolling to it.
  const goToRecentlyViewed = (e) => {
    e.preventDefault();
    setAccountOpen(false);

    const scrollIfPresent = () => {
      const el = document.getElementById("recently-viewed");
      if (!el) return false;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return true;
    };

    if (window.location.pathname === "/" && scrollIfPresent()) return;

    navigate("/");
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      if (scrollIfPresent() || attempts > 20) clearInterval(interval);
    }, 100);
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
      alert(t("Voice search is not supported in this browser.", "इस ब्राउज़र में आवाज़ से खोज उपलब्ध नहीं है।"));
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
                    {t("Deliver to ", "डिलीवर करें ")}{deliverName}
                  </span>
                  <span className="block text-sm font-bold text-slate-900">
                    {deliverPlace}
                  </span>
                </span>
              </button>

              {addressOpen && (
                <div className="absolute top-full left-0 z-50 mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-lg py-2">
                  <div className="px-4 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    {t("Choose delivery address", "डिलीवरी पता चुनें")}
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
                              {t("Current", "वर्तमान")}
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
                      {t("+ Add New Address", "+ नया पता जोड़ें")}
                    </Link>
                    <Link
                      to="/addresses"
                      onClick={() => setAddressOpen(false)}
                      className="block px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-amber-600"
                    >
                      {t("Manage Addresses", "पते प्रबंधित करें")}
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
                    {t("Deliver to ", "डिलीवर करें ")}{deliverName}
                  </span>
                  <span className="block text-sm font-bold text-slate-900">
                    {deliverPlace}
                  </span>
                </span>
              ) : (
                <span className="text-sm font-bold text-slate-900">
                  {t("Deliver to: ", "डिलीवर करें: ")}{deliverPlace}
                </span>
              )}
            </Link>
          ))}

        {/* Search */}
        <form
          ref={searchFormRef}
          onSubmit={handleSearchSubmit}
          className="relative flex-1 max-w-2xl mx-auto hidden md:flex"
        >
          <div className="w-full flex items-center border border-slate-300 rounded-full pr-1.5 py-1.5">
            <div className="relative shrink-0" ref={categoryMenuRef}>
              <button
                type="button"
                onClick={() => setCategoryMenuOpen((prev) => !prev)}
                aria-label={t("Search category", "सर्च श्रेणी")}
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
                    {t("All Categories", "सभी श्रेणियां")}
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
              placeholder={t("Search Bedsheets, Towels, Curtains...", "बेडशीट, टॉवल, कर्टन खोजें...")}
              className="flex-1 min-w-0 outline-none text-sm text-slate-700 placeholder:text-slate-400 pl-3"
            />
            <button
              type="button"
              onClick={handleMicClick}
              title={listening ? t("Listening...", "सुन रहे हैं...") : t("Search by voice", "आवाज़ से खोजें")}
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
              {t("Go", "जाएं")}
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
        <div className="flex items-center gap-1 lg:gap-2 min-[1440px]:gap-6 ml-auto shrink-0">
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
              className="hidden md:block relative"
              onMouseEnter={openAccountMenu}
              onMouseLeave={scheduleCloseAccountMenu}
            >
              <button
                type="button"
                className="flex items-center gap-1.5 text-slate-600 hover:text-blue-700 transition-colors"
              >
                <span className="w-7 h-7 rounded-full bg-amber-600 text-white text-sm font-semibold flex items-center justify-center shrink-0">
                  {user?.name?.charAt(0).toUpperCase()}
                </span>
                <span className="text-sm">{t("Account", "खाता")}</span>
              </button>

              {accountOpen && (
                <div className="absolute top-full right-0 z-50 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg py-2">
                  <div className="px-4 py-2 text-sm text-slate-500 border-b border-slate-100 truncate">
                    {t("Hi, ", "नमस्ते, ")}{user?.name}
                  </div>

                  <Link
                    to="/account"
                    className="block px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 hover:text-amber-600"
                  >
                    {t("My Account", "मेरा खाता")}
                  </Link>

                  <Link
                    to="/my-orders"
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-amber-600"
                  >
                    {t("My Orders", "मेरे ऑर्डर")}
                  </Link>

                  <Link
                    to="/wishlist"
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-amber-600"
                  >
                    {t("Wishlist", "विशलिस्ट")}
                  </Link>

                  <Link
                    to="/change-password"
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-amber-600"
                  >
                    {t("Change Password", "पासवर्ड बदलें")}
                  </Link>

                  <button
                    type="button"
                    onClick={handleInstallClick}
                    className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-amber-600"
                  >
                    {t("Download the App", "ऐप डाउनलोड करें")}
                  </button>

                  <button
                    type="button"
                    onClick={logout}
                    className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-slate-50"
                  >
                    {t("Logout", "लॉगआउट")}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div
              className="hidden md:block relative"
              onMouseEnter={openAccountMenu}
              onMouseLeave={scheduleCloseAccountMenu}
            >
              <Link
                to="/login"
                className="flex items-center gap-1.5 text-slate-600 hover:text-blue-700 transition-colors"
              >
                <FaUser className="text-lg" />
                <span className="text-sm">{t("Sign In", "साइन इन")}</span>
              </Link>

              {accountOpen && (
                <div className="absolute top-full right-0 z-50 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg py-3">
                  <div className="px-4 flex flex-col gap-2 pb-3 border-b border-slate-100">
                    <Link
                      to="/login"
                      className="block text-center bg-blue-900 hover:bg-blue-950 text-white text-sm font-semibold rounded-full py-2 transition-colors"
                    >
                      {t("Sign In", "साइन इन करें")}
                    </Link>
                    <Link
                      to="/register"
                      className="block text-center text-sm font-medium text-blue-900 hover:underline"
                    >
                      {t("Create an Account", "खाता बनाएं")}
                    </Link>
                  </div>

                  <Link
                    to="/login?redirect=/account"
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-amber-600"
                  >
                    {t("My Account", "मेरा खाता")}
                  </Link>

                  <Link
                    to="/login?redirect=/my-orders"
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-amber-600"
                  >
                    {t("My Orders", "मेरे ऑर्डर")}
                  </Link>

                  <Link
                    to="/wishlist"
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-amber-600"
                  >
                    {t("Wishlist", "विशलिस्ट")}
                  </Link>

                  <Link
                    to="/login?redirect=/my-orders"
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-amber-600"
                  >
                    {t("Review My Purchases", "अपनी खरीद की समीक्षा करें")}
                  </Link>

                  <Link
                    to="/#recently-viewed"
                    onClick={goToRecentlyViewed}
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-amber-600"
                  >
                    {t("Recently Viewed", "हाल ही में देखे गए")}
                  </Link>

                  <Link
                    to="/contact"
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-amber-600"
                  >
                    {t("Help & Contact", "सहायता और संपर्क")}
                  </Link>

                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={handleInstallClick}
                      className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-amber-600"
                    >
                      {t("Download the App", "ऐप डाउनलोड करें")}
                    </button>

                    <Link
                      to="/login?redirect=/loyalty-history"
                      className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-amber-600"
                    >
                      {t("Loyalty Points", "लॉयल्टी पॉइंट्स")}
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={openCart}
            className="flex items-center gap-1.5 text-slate-600 hover:text-blue-700 transition-colors"
          >
            <span className="relative">
              <FaShoppingCart className="text-lg" />
              {totalItems > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {totalItems}
                </span>
              )}
            </span>
            <span className="hidden sm:inline text-sm">{t("Cart", "कार्ट")}</span>
          </button>
        </div>
      </div>

      {/* Mobile search (shows below on small screens) */}
      <form
        ref={mobileSearchFormRef}
        onSubmit={handleSearchSubmit}
        className="relative px-4 pb-3 md:hidden"
      >
        <div className="flex items-center border border-slate-300 rounded-full pr-1.5 py-1.5">
          <div className="relative shrink-0" ref={mobileCategoryMenuRef}>
            <button
              type="button"
              onClick={() => setMobileCategoryMenuOpen((prev) => !prev)}
              aria-label={t("Search category", "सर्च श्रेणी")}
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
                  {t("All Categories", "सभी श्रेणियां")}
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
            placeholder={t("Search products...", "प्रोडक्ट खोजें...")}
            className="flex-1 min-w-0 outline-none text-sm text-slate-700 placeholder:text-slate-400 pl-3"
          />
          <button
            type="button"
            onClick={handleMicClick}
            title={listening ? t("Listening...", "सुन रहे हैं...") : t("Search by voice", "आवाज़ से खोजें")}
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
            {t("Go", "जाएं")}
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
