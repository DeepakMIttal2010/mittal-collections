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
import { getVisitorId } from "../utils/visitorId";

const WishlistContext = createContext();

export function WishlistProvider({ children }) {
  const [wishlistItems, setWishlistItems] = useState([]);
  const { isLoggedIn } = useAuth();

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
  }, [isLoggedIn]);

  const addToWishlist = async (product) => {
    const exists = wishlistItems.find((item) => item._id === product._id);

    if (exists) {
      toast.info("Already in wishlist");
      return;
    }

    const response = isLoggedIn
      ? await addWishlistAPI(product._id)
      : await addToGuestWishlist(getVisitorId(), product._id);

    if (response.success) {
      setWishlistItems([...wishlistItems, product]);

      toast.success("Added to wishlist ❤️");
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

      toast.success("Removed from wishlist");
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
      toast.success("Wishlist cleared successfully");
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
