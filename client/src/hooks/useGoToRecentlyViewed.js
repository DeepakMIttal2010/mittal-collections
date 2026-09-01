import { useNavigate } from "react-router-dom";

// The Recently Viewed section only exists on Home, and only once it has
// products to show (it renders null while empty/loading — see
// RecentlyViewed.jsx), so a plain `#recently-viewed` link can't rely on
// the element already being there. Navigate first, then poll briefly
// for the section to mount before scrolling to it. Shared by the
// desktop header dropdown and the mobile account drawer so both stay
// in sync.
export function useGoToRecentlyViewed() {
  const navigate = useNavigate();

  return (e) => {
    e.preventDefault();

    const scrollIfPresent = () => {
      const el = document.getElementById("recently-viewed");
      if (!el) return false;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return true;
    };

    if (window.location.pathname === "/" && scrollIfPresent()) return;

    navigate("/");
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      if (scrollIfPresent() || attempts > 20) clearInterval(interval);
    }, 100);
  };
}
