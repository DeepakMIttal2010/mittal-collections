import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { recordVisit } from "../services/analyticsService";
import { useAuth } from "../context/AuthContext";
import { getVisitorId } from "../utils/visitorId";

function VisitTracker() {
  const { pathname } = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    recordVisit(pathname, getVisitorId(), user?.id);
  }, [pathname, user]);

  return null;
}

export default VisitTracker;
