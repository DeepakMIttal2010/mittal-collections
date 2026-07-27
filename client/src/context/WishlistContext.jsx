import { createContext, useContext, useEffect, useState } from "react";
import { toast } from "react-toastify";

import {
  getWishlist,
  addToWishlist as addWishlistAPI,
  removeFromWishlist as removeWishlistAPI,
  clearWishlist as clearWishlistAPI,
} from "../services/wishlistService";

import { useAuth } from "./AuthContext";

const WishlistContext = createContext();

export function WishlistProvider({ children }) {
  const [wishlistItems, setWishlistItems] = useState([]);
  const { isLoggedIn } = useAuth();

  useEffect(() => {
    const loadWishlist = async () => {
      if (!isLoggedIn) {
        setWishlistItems([]);
        return;
      }

      const data = await getWishlist();

      console.log("Wishlist API:", data);

      const products = data.map((item) => item.product).filter(Boolean);

      console.log("Products:", products);

      setWishlistItems(products);
    };

    loadWishlist();
  }, [isLoggedIn]);

  const addToWishlist = async (product) => {
    if (!isLoggedIn) {
      toast.error("Please login first");
      return;
    }

    const exists = wishlistItems.find((item) => item._id === product._id);

    if (exists) {
      toast.info("Already in wishlist");
      return;
    }

    const response = await addWishlistAPI(product._id);

    if (response.success) {
      setWishlistItems([...wishlistItems, product]);

      toast.success("Added to wishlist ❤️");
    } else {
      toast.error(response.message);
    }
  };

  const removeFromWishlist = async (productId) => {
    const response = await removeWishlistAPI(productId);

    if (response.success) {
      setWishlistItems(wishlistItems.filter((item) => item._id !== productId));

      toast.success("Removed from wishlist");
    } else {
      toast.error(response.message);
    }
  };

  const clearWishlist = async () => {
    const response = await clearWishlistAPI();

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
