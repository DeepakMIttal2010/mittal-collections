// Shared anonymous visitor id — used by VisitTracker (page views) and, for
// guests, CartContext (cart sync) so the same browser's browsing and cart
// activity line up under one id rather than each minting its own.
const VISITOR_ID_KEY = "mc_visitor_id";

export const getVisitorId = () => {
  let visitorId = localStorage.getItem(VISITOR_ID_KEY);

  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem(VISITOR_ID_KEY, visitorId);
  }

  return visitorId;
};
