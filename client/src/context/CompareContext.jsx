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

import { readJsonFromStorage } from "../utils/safeLocalStorage";
import { useAuth } from "./AuthContext";
import { useLanguage } from "./LanguageContext";

const CompareContext = createContext();

const MAX_COMPARE_ITEMS = 4;

export function CompareProvider({ children }) {
  const [compareItems, setCompareItems] = useState(() =>
    readJsonFromStorage("compareItems", []),
  );
  const { user } = useAuth();
  const { t } = useLanguage();

  // Same reasoning as CartContext's cartItemsRef -- lets the handlers
  // below be stable useCallbacks while still reading the current
  // compare list for their membership checks.
  const compareItemsRef = useRef(compareItems);
  useEffect(() => {
    compareItemsRef.current = compareItems;
  }, [compareItems]);

  useEffect(() => {
    localStorage.setItem("compareItems", JSON.stringify(compareItems));
  }, [compareItems]);

  // Same reasoning as CartContext's identical guard (see its comment for
  // the full explanation): tracks the actual user id, not just a
  // logged-in boolean, so User A logging in as User B WITHOUT an
  // explicit logout first still clears the compare list — a plain
  // true/false check never transitions through false in that case.
  const wasUserId = useRef(user?._id ?? null);

  useEffect(() => {
    const currentUserId = user?._id ?? null;

    if (wasUserId.current && currentUserId !== wasUserId.current) {
      setCompareItems([]);
    }

    wasUserId.current = currentUserId;
  }, [user]);

  const isInCompare = useCallback(
    (productId) => compareItemsRef.current.some((item) => item._id === productId),
    [],
  );

  const addToCompare = useCallback(
    (product) => {
      const compareItems = compareItemsRef.current;
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

      // Functional updater, not a plain array built from the ref — same
      // reasoning as CartContext's addToCart (2026-10-13 deep bug sweep).
      // The membership/length checks above can run against a stale ref on
      // two rapid clicks; this re-guards against both a duplicate entry
      // and exceeding MAX_COMPARE_ITEMS using React's actual latest state.
      setCompareItems((prev) => {
        if (prev.some((item) => item._id === product._id)) return prev;
        if (prev.length >= MAX_COMPARE_ITEMS) return prev;
        return [...prev, product];
      });
      toast.success(t("Added to compare", "कंपेयर में जोड़ा गया"));
    },
    [isInCompare, t],
  );

  const removeFromCompare = useCallback((productId) => {
    setCompareItems((prev) => prev.filter((item) => item._id !== productId));
  }, []);

  const toggleCompare = useCallback(
    (product) => {
      if (isInCompare(product._id)) {
        removeFromCompare(product._id);
      } else {
        addToCompare(product);
      }
    },
    [isInCompare, removeFromCompare, addToCompare],
  );

  const clearCompare = useCallback(() => setCompareItems([]), []);

  // compareItems legitimately changes whenever the list does -- this
  // useMemo avoids a new value object (and the resulting re-render of
  // every consumer, including every ProductCard subscribed for its
  // compare-toggle state) when CompareProvider re-renders for a reason
  // unrelated to the compare list itself.
  const value = useMemo(
    () => ({
      compareItems,
      isInCompare,
      addToCompare,
      removeFromCompare,
      toggleCompare,
      clearCompare,
      maxCompareItems: MAX_COMPARE_ITEMS,
    }),
    [compareItems, isInCompare, addToCompare, removeFromCompare, toggleCompare, clearCompare],
  );

  return (
    <CompareContext.Provider value={value}>
      {children}
    </CompareContext.Provider>
  );
}

export function useCompare() {
  return useContext(CompareContext);
}
