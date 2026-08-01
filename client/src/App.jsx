import { useLocation } from "react-router-dom";

import AppRoutes from "./routes/AppRoutes";
import ScrollToTop from "./components/ScrollToTop";
import BackToTopButton from "./components/BackToTopButton";
import ZoomControl from "./components/ZoomControl";
import VisitTracker from "./components/VisitTracker";

function App() {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith("/admin");

  return (
    <>
      <ScrollToTop />
      <AppRoutes />
      <BackToTopButton />
      {isAdmin && <ZoomControl />}
      {!isAdmin && <VisitTracker />}
    </>
  );
}

export default App;
