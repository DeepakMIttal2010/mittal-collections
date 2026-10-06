import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

// Single source of truth for "is this customer route reachable while
// logged out" — previously reimplemented per-page (Account.jsx,
// MyOrders.jsx, Checkout.jsx, ~13 pages total), each with its own
// useEffect(() => { if (!isLoggedIn) navigate(...) }). Functionally
// equivalent to those (every data fetch on those pages already depended
// on isLoggedIn/a token, so nothing ever actually leaked), but a page
// added later without copying the pattern would be a real unguarded
// route with no way to catch it except by grepping every file — wrapping
// the whole private subtree here in one place removes that risk. Mirrors
// AdminProtectedRoute.jsx's redirect-target convention exactly.
function ProtectedRoute() {
  const { isLoggedIn } = useAuth();
  const location = useLocation();

  if (!isLoggedIn) {
    const redirectTarget = `${location.pathname}${location.search}`;
    return (
      <Navigate to={`/login?redirect=${encodeURIComponent(redirectTarget)}`} replace />
    );
  }

  return <Outlet />;
}

export default ProtectedRoute;
