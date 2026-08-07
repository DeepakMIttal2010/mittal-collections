import { createContext, useContext, useEffect, useState } from "react";
import { toast } from "react-toastify";

const CompareContext = createContext();

const MAX_COMPARE_ITEMS = 4;

export function CompareProvider({ children }) {
  const [compareItems, setCompareItems] = useState(() => {
    const saved = localStorage.getItem("compareItems");
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem("compareItems", JSON.stringify(compareItems));
  }, [compareItems]);

  const isInCompare = (productId) =>
    compareItems.some((item) => item._id === productId);

  const addToCompare = (product) => {
    if (isInCompare(product._id)) return;

    if (compareItems.length >= MAX_COMPARE_ITEMS) {
      toast.error(`You can compare up to ${MAX_COMPARE_ITEMS} products`);
      return;
    }

    setCompareItems([...compareItems, product]);
    toast.success("Added to compare");
  };

  const removeFromCompare = (productId) => {
    setCompareItems(compareItems.filter((item) => item._id !== productId));
  };

  const toggleCompare = (product) => {
    if (isInCompare(product._id)) {
      removeFromCompare(product._id);
    } else {
      addToCompare(product);
    }
  };

  const clearCompare = () => setCompareItems([]);

  return (
    <CompareContext.Provider
      value={{
        compareItems,
        isInCompare,
        addToCompare,
        removeFromCompare,
        toggleCompare,
        clearCompare,
        maxCompareItems: MAX_COMPARE_ITEMS,
      }}
    >
      {children}
    </CompareContext.Provider>
  );
}

export function useCompare() {
  return useContext(CompareContext);
}
