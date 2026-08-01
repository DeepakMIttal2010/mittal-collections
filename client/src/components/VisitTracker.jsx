import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { recordVisit } from "../services/analyticsService";

const VISITOR_ID_KEY = "mc_visitor_id";

const getVisitorId = () => {
  let visitorId = localStorage.getItem(VISITOR_ID_KEY);

  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem(VISITOR_ID_KEY, visitorId);
  }

  return visitorId;
};

function VisitTracker() {
  const { pathname } = useLocation();

  useEffect(() => {
    recordVisit(pathname, getVisitorId());
  }, [pathname]);

  return null;
}

export default VisitTracker;
