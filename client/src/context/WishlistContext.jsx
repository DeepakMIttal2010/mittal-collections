import { createContext, useContext, useEffect, useState } from "react";
import { toast } from "react-toastify";

import {
  getWishlist,
  addToWishlist as addWishlistAPI,
  removeFromWishlist as removeWishlistAPI,
  clearWishlist as clearWishlistAPI,
  getGuestWishlist,
  addToGuestWishlist,
  removeFromGuestWishlist,
  clearGuestWishlist,
  mergeGuestWishlist,
} from "../services/wishlistService";

import { useAuth } from "./AuthContext";
import { useLanguage } from "./LanguageContext";
import { getVisitorId } from "../utils/visitorId";

const WishlistContext = createContext();

export function WishlistProvider({ children }) {
  const [wishlistItems, setWishlistItems] = useState([]);
  const { isLoggedIn, user } = useAuth();
  const { t } = useLanguage();

  // Keyed on the actual user id, not just isLoggedIn — User A logging in
  // as User B without an explicit logout first never transitions
  // isLoggedIn through false, so a plain [isLoggedIn] dependency would
  // keep showing User A's wishlist to User B until a manual page
  // refresh (same bug class already fixed for CartContext/
  // CompareContext on the same shared-device scenario).
  useEffect(() => {
    const loadWishlist = async () => {
      if (isLoggedIn) {
        // Idempotent — a guest wishlist only exists the first time this
        // runs after logging in; once folded into the account it's gone,
        // so every later call here is just a harmless no-op.
        await mergeGuestWishlist(getVisitorId());

        const data = await getWishlist();
        setWishlistItems(data.map((item) => item.product).filter(Boolean));
        return;
      }

      const data = await getGuestWishlist(getVisitorId());
      setWishlistItems(data.map((item) => item.product).filter(Boolean));
    };

    loadWishlist();
  }, [isLoggedIn, user?._id]);

  const addToWishlist = async (product) => {
    const exists = wishlistItems.find((item) => item._id === product._id);

    if (exists) {
      toast.info(t("Already in wishlist", "पहले से विशलिस्ट में है"));
      return;
    }

    const response = isLoggedIn
      ? await addWishlistAPI(product._id)
      : await addToGuestWishlist(getVisitorId(), product._id);

    if (response.success) {
      setWishlistItems([...wishlistItems, product]);

      toast.success(t("Added to wishlist ❤️", "विशलिस्ट में जोड़ा गया ❤️"));
    } else {
      toast.error(response.message);
    }
  };

  const removeFromWishlist = async (productId) => {
    const response = isLoggedIn
      ? await removeWishlistAPI(productId)
      : await removeFromGuestWishlist(getVisitorId(), productId);

    if (response.success) {
      setWishlistItems(wishlistItems.filter((item) => item._id !== productId));

      toast.success(t("Removed from wishlist", "विशलिस्ट से हटाया गया"));
    } else {
      toast.error(response.message);
    }
  };

  const clearWishlist = async () => {
    const response = isLoggedIn
      ? await clearWishlistAPI()
      : await clearGuestWishlist(getVisitorId());

    if (response.success) {
      setWishlistItems([]);
      toast.success(t("Wishlist cleared successfully", "विशलिस्ट खाली कर दी गई"));
    } else {
      toast.error(response.message);
    }
  };

  const totalWishlistItems = wishlistItems.length;

  return (
    <WishlistContext.Provider
      value={{
        wishlistItems,
        addToWishlist,
        removeFromWishlist,
        clearWishlist,
        totalWishlistItems,
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  return useContext(WishlistContext);
}
