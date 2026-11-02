import { useEffect, useState } from "react";

import { getBigSavingsProducts } from "../services/productService";

// Whether the Clearance Sale page currently has anything to show. Items
// qualify only against a verified printed MRP (server getBigSavingsProducts),
// so the section can legitimately be empty -- the nav links hide then
// instead of advertising an empty sale. One request per page load, shared
// by every caller (Navbar + MobileMenu). Starts false: the link appears
// only once there is something behind it.
let clearancePromise = null;

const loadHasClearance = () => {
  clearancePromise ||= getBigSavingsProducts(1)
    .then((res) => Boolean(res.success && res.sections?.length))
    .catch(() => false);
  return clearancePromise;
};

export const useHasClearance = () => {
  const [hasClearance, setHasClearance] = useState(false);

  useEffect(() => {
    let active = true;
    loadHasClearance().then((value) => {
      if (active) setHasClearance(value);
    });
    return () => {
      active = false;
    };
  }, []);

  return hasClearance;
};
