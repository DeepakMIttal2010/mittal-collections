// Shared anonymous visitor id — used by VisitTracker (page views) and, for
// guests, CartContext (cart sync) so the same browser's browsing and cart
// activity line up under one id rather than each minting its own.
const VISITOR_ID_KEY = "mc_visitor_id";
// Set permanently on any browser an admin/staff account has signed in on,
// so the owner's and staff's own browsing never counts as a visitor --
// even later, while logged out on that same browser.
const INTERNAL_DEVICE_KEY = "mc_internal_device";

export const isInternalDevice = () =>
  localStorage.getItem(INTERNAL_DEVICE_KEY) === "1";

export const setInternalDevice = () =>
  localStorage.setItem(INTERNAL_DEVICE_KEY, "1");

export const getVisitorId = () => {
  let visitorId = localStorage.getItem(VISITOR_ID_KEY);

  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem(VISITOR_ID_KEY, visitorId);
  }

  return visitorId;
};
