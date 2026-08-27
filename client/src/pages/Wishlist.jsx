import { imgUrl } from "../services/api";
import { Link } from "react-router-dom";
import { FaTrash, FaShoppingCart } from "react-icons/fa";

import { useWishlist } from "../context/WishlistContext";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

function Wishlist() {
  const { wishlistItems, removeFromWishlist, clearWishlist } = useWishlist();

  const { addToCart } = useCart();
  const { isLoggedIn } = useAuth();
  const { t } = useLanguage();

  const hasItems = wishlistItems && wishlistItems.length > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {isLoggedIn && (
        <div className="text-sm mb-2">
          <Link to="/account" className="text-blue-700 hover:underline">
            {t("Your Account", "आपका खाता")}
          </Link>
          <span className="text-slate-400 mx-2">›</span>
          <span className="text-amber-600 font-medium">{t("Wishlist", "विशलिस्ट")}</span>
        </div>
      )}

      <h1 className="text-3xl font-bold text-slate-900 mb-6">{t("My Wishlist", "मेरी विशलिस्ट")}</h1>

      {!hasItems ? (
        <div>
          <p className="text-slate-500 mb-4">
            {t(
              "Your wishlist is empty. Save your favourite products here.",
              "आपकी विशलिस्ट खाली है। अपने पसंदीदा प्रोडक्ट यहां सहेजें।",
            )}
          </p>
          <Link
            to="/"
            className="inline-block bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-6 py-3 transition-colors"
          >
            {t("Continue Shopping", "शॉपिंग जारी रखें")}
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {wishlistItems.map((item) => (
              <div
                key={item._id}
                className="border border-slate-200 rounded-xl bg-white overflow-hidden"
              >
                <img
                  src={`${imgUrl(item.image)}`}
                  alt={item.name}
                  className="w-full h-48 object-cover"
                />

                <div className="p-4">
                  <h3 className="font-medium text-slate-800 truncate">
                    {item.name}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {item.category?.name || item.category}
                  </p>
                  <p className="text-lg font-semibold text-green-700 mt-1">
                    ₹{item.price}
                  </p>

                  <div className="flex flex-col gap-2 mt-4">
                    <button
                      type="button"
                      onClick={() => {
                        addToCart(item);
                        removeFromWishlist(item._id);
                      }}
                      className="flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-950 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
                    >
                      <FaShoppingCart />
                      {t("Add to Cart", "कार्ट में डालें")}
                    </button>

                    <button
                      type="button"
                      onClick={() => removeFromWishlist(item._id)}
                      className="flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium py-2.5 rounded-lg transition-colors"
                    >
                      <FaTrash />
                      {t("Remove", "हटाएं")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <button
              type="button"
              onClick={clearWishlist}
              className="text-red-600 hover:text-red-700 text-sm font-medium underline"
            >
              {t("Clear Wishlist", "विशलिस्ट खाली करें")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default Wishlist;
