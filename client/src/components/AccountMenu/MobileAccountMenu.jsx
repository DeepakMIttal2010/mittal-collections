import { FaTimes } from "react-icons/fa";

import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import AccountMenuContent from "./AccountMenuContent";

// Mobile equivalent of the desktop header's hover dropdown — there's no
// hover on a phone, so BottomNav's Account tab opens this slide-in
// drawer instead (same chrome pattern as MobileMenu.jsx's Categories
// drawer, mirrored from the right since Account sits on the right end
// of the tab bar).
function MobileAccountMenu({ isOpen, onClose }) {
  const { user, logout, isLoggedIn } = useAuth();
  const { t } = useLanguage();

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/40 z-[100] transition-opacity md:hidden ${
          isOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      />

      <div
        className={`fixed top-0 right-0 h-full w-[85%] max-w-sm bg-white z-[101] shadow-xl flex flex-col transition-transform duration-300 md:hidden ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">
            {t("Account", "खाता")}
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label={t("Close menu", "मेनू बंद करें")}
            className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800"
          >
            <FaTimes />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <AccountMenuContent
            isLoggedIn={isLoggedIn}
            user={user}
            logout={logout}
            t={t}
            onNavigate={onClose}
          />
        </div>
      </div>
    </>
  );
}

export default MobileAccountMenu;
