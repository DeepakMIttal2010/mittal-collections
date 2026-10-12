import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

  // Same reasoning as CartContext's cartItemsRef: lets the handlers below
  // be stable useCallbacks (never change reference) while still reading
  // the current wishlist for their "already in there?" checks, without
  // needing wishlistItems in their own dependency array.
  const wishlistItemsRef = useRef(wishlistItems);
  useEffect(() => {
    wishlistItemsRef.current = wishlistItems;
  }, [wishlistItems]);

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

  const addToWishlist = useCallback(
    async (product) => {
      const exists = wishlistItemsRef.current.find((item) => item._id === product._id);

      if (exists) {
        toast.info(t("Already in wishlist", "पहले से विशलिस्ट में है"));
        return;
      }

      const response = isLoggedIn
        ? await addWishlistAPI(product._id)
        : await addToGuestWishlist(getVisitorId(), product._id);

      if (response.success) {
        setWishlistItems([...wishlistItemsRef.current, product]);

        toast.success(t("Added to wishlist ❤️", "विशलिस्ट में जोड़ा गया ❤️"));
      } else {
        toast.error(response.message);
      }
    },
    [isLoggedIn, t],
  );

  const removeFromWishlist = useCallback(
    async (productId) => {
      const response = isLoggedIn
        ? await removeWishlistAPI(productId)
        : await removeFromGuestWishlist(getVisitorId(), productId);

      if (response.success) {
        setWishlistItems(
          wishlistItemsRef.current.filter((item) => item._id !== productId),
        );

        toast.success(t("Removed from wishlist", "विशलिस्ट से हटाया गया"));
      } else {
        toast.error(response.message);
      }
    },
    [isLoggedIn, t],
  );

  const clearWishlist = useCallback(async () => {
    const response = isLoggedIn
      ? await clearWishlistAPI()
      : await clearGuestWishlist(getVisitorId());

    if (response.success) {
      setWishlistItems([]);
      toast.success(t("Wishlist cleared successfully", "विशलिस्ट खाली कर दी गई"));
    } else {
      toast.error(response.message);
    }
  }, [isLoggedIn, t]);

  // wishlistItems/totalWishlistItems legitimately change whenever the
  // wishlist does -- this useMemo is about avoiding a new value object
  // (and the resulting re-render of every consumer, including every
  // ProductCard subscribed for its heart-icon state) when WishlistProvider
  // re-renders for a reason unrelated to the wishlist itself (e.g. a
  // parent cascade), not about making the wishlist data itself stable.
  const value = useMemo(
    () => ({
      wishlistItems,
      addToWishlist,
      removeFromWishlist,
      clearWishlist,
      totalWishlistItems: wishlistItems.length,
    }),
    [wishlistItems, addToWishlist, removeFromWishlist, clearWishlist],
  );

  return (
    <WishlistContext.Provider value={value}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  return useContext(WishlistContext);
}
