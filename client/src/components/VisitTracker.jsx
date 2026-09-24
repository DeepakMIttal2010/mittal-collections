import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { recordVisit, markInternalDevice } from "../services/analyticsService";
import { useAuth } from "../context/AuthContext";
import { isAdminLoggedIn } from "../services/authService";
import {
  getVisitorId,
  isInternalDevice,
  setInternalDevice,
} from "../utils/visitorId";

// Mounted on every route (admin included) so an admin/staff sign-in on
// any page flags this browser, but only non-admin pages are recorded.
function VisitTracker() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  // Two separate ways to be "staff" here: an admin account logged in
  // through the customer-facing form (role lands in the shared
  // AuthContext/`user`+`token` localStorage keys), or the dedicated
  // /admin/login form -- which saveAdminLogin() writes to its own
  // `adminUser`/`adminToken` keys, entirely invisible to useAuth(). The
  // admin panel is only ever reached the second way, so checking role
  // alone left this never firing for it at all.
  const isStaff = user?.role === "admin" || isAdminLoggedIn();

  useEffect(() => {
    if (!isStaff || isInternalDevice()) return;

    // Only flagged once the server has actually deleted this browser's
    // past visits; if that call fails, the next page load (still signed
    // in as staff, so still not recording) simply retries it.
    markInternalDevice(getVisitorId()).then((res) => {
      if (res.success) setInternalDevice();
    });
  }, [isStaff]);

  useEffect(() => {
    // navigator.webdriver is set by Playwright/Selenium/Puppeteer even
    // when they spoof a normal Chrome user agent, which the server's
    // user-agent bot filter alone can't catch.
    if (
      pathname.startsWith("/admin") ||
      isStaff ||
      isInternalDevice() ||
      navigator.webdriver
    ) {
      return;
    }

    recordVisit(pathname, getVisitorId(), user?.id);
  }, [pathname, user, isStaff]);

  return null;
}

export default VisitTracker;
