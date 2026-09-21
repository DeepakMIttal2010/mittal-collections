import { createContext, useContext, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";

import { readJsonFromStorage } from "../utils/safeLocalStorage";
import { useAuth } from "./AuthContext";
import { useLanguage } from "./LanguageContext";

const CompareContext = createContext();

const MAX_COMPARE_ITEMS = 4;

export function CompareProvider({ children }) {
  const [compareItems, setCompareItems] = useState(() =>
    readJsonFromStorage("compareItems", []),
  );
  const { isLoggedIn } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    localStorage.setItem("compareItems", JSON.stringify(compareItems));
  }, [compareItems]);

  // Same reasoning as CartContext's identical guard: a shared/kiosk
  // device would otherwise keep whoever-logged-out's compare list
  // sitting in localStorage for the next person to log in and see.
  const wasLoggedIn = useRef(isLoggedIn);

  useEffect(() => {
    if (wasLoggedIn.current && !isLoggedIn) {
      setCompareItems([]);
    }
    wasLoggedIn.current = isLoggedIn;
  }, [isLoggedIn]);

  const isInCompare = (productId) =>
    compareItems.some((item) => item._id === productId);

  const addToCompare = (product) => {
    if (isInCompare(product._id)) return;

    if (compareItems.length >= MAX_COMPARE_ITEMS) {
      toast.error(
        t(
          `You can compare up to ${MAX_COMPARE_ITEMS} products`,
          `आप अधिकतम ${MAX_COMPARE_ITEMS} प्रोडक्ट कंपेयर कर सकते हैं`,
        ),
      );
      return;
    }

    setCompareItems([...compareItems, product]);
    toast.success(t("Added to compare", "कंपेयर में जोड़ा गया"));
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
