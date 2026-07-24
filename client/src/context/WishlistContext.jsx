import { createContext, useContext, useEffect, useState } from "react";

import { toast } from "react-toastify";

const WishlistContext = createContext();

export function WishlistProvider({ children }) {
  const [wishlistItems, setWishlistItems] = useState(() => {
    const savedWishlist = localStorage.getItem("wishlistItems");

    return savedWishlist ? JSON.parse(savedWishlist) : [];
  });

  useEffect(() => {
    localStorage.setItem("wishlistItems", JSON.stringify(wishlistItems));
  }, [wishlistItems]);

  const addToWishlist = (product) => {
    const exists = wishlistItems.find((item) => item.id === product.id);

    if (!exists) {
      setWishlistItems([...wishlistItems, product]);

      toast.success("Added to wishlist ❤️");
    } else {
      toast.info("Already in wishlist");
    }
  };

  const removeFromWishlist = (id) => {
    setWishlistItems(wishlistItems.filter((item) => item.id !== id));

    toast.error("Removed from wishlist");
  };

  const clearWishlist = () => {
    setWishlistItems([]);

    toast.warning("Wishlist cleared");
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
