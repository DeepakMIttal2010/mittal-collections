import { createContext, useContext, useEffect, useState } from "react";

import { toast } from "react-toastify";

import { syncCart } from "../services/cartService";
import { useAuth } from "./AuthContext";

const CartContext = createContext();

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState(() => {
    const savedCart = localStorage.getItem("cartItems");
    return savedCart ? JSON.parse(savedCart) : [];
  });

  const [isCartOpen, setIsCartOpen] = useState(false);
  const { isLoggedIn } = useAuth();

  useEffect(() => {
    localStorage.setItem("cartItems", JSON.stringify(cartItems));
  }, [cartItems]);

  // Mirror the cart to the backend (debounced) so an abandoned-cart
  // reminder can be sent later — purely a background sync, not used
  // to render anything here.
  useEffect(() => {
    if (!isLoggedIn) return;

    const timeout = setTimeout(() => {
      syncCart(cartItems);
    }, 2000);

    return () => clearTimeout(timeout);
  }, [cartItems, isLoggedIn]);

  const openCart = () => setIsCartOpen(true);
  const closeCart = () => setIsCartOpen(false);

  const addToCart = (product, qty = 1) => {
    const existingItem = cartItems.find((item) => item._id === product._id);

    if (existingItem) {
      const newQuantity = Math.min(existingItem.quantity + qty, product.stock);

      if (newQuantity <= existingItem.quantity) {
        toast.error(`Only ${product.stock} in stock`);
        openCart();
        return;
      }

      setCartItems(
        cartItems.map((item) =>
          item._id === product._id
            ? {
                ...item,
                quantity: newQuantity,
              }
            : item,
        ),
      );

      toast.info("Product quantity updated");
    } else {
      if (product.stock <= 0) {
        toast.error("Out of stock");
        return;
      }

      setCartItems([
        ...cartItems,
        {
          ...product,
          quantity: Math.min(qty, product.stock),
        },
      ]);

      toast.success("Product added to cart 🛒");
    }

    openCart();
  };

  const removeFromCart = (id) => {
    setCartItems(cartItems.filter((item) => item._id !== id));

    toast.error("Product removed from cart");
  };

  const increaseQty = (id) => {
    const item = cartItems.find((cartItem) => cartItem._id === id);

    if (item && item.quantity >= item.stock) {
      toast.error(`Only ${item.stock} in stock`);
      return;
    }

    setCartItems(
      cartItems.map((cartItem) =>
        cartItem._id === id
          ? {
              ...cartItem,
              quantity: cartItem.quantity + 1,
            }
          : cartItem,
      ),
    );
  };

  const decreaseQty = (id) => {
    setCartItems(
      cartItems.map((item) =>
        item._id === id
          ? {
              ...item,
              quantity: item.quantity > 1 ? item.quantity - 1 : 1,
            }
          : item,
      ),
    );
  };

  const clearCart = () => {
    setCartItems([]);
    toast.warning("Cart cleared");
  };

  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const totalPrice = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        removeFromCart,
        increaseQty,
        decreaseQty,
        clearCart,
        totalItems,
        totalPrice,
        isCartOpen,
        openCart,
        closeCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
