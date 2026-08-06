import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaTimes, FaGift } from "react-icons/fa";

import { useAuth } from "../context/AuthContext";
import { getPublicRewardsInfo } from "../services/rewardsService";

const SHOWN_KEY = "mc_rewards_popup_shown";
const SHOW_AFTER_MS = 4000;
const AUTO_CLOSE_AFTER_MS = 10000;

function RewardsPromoPopup() {
  const { isLoggedIn } = useAuth();
  const [rewards, setRewards] = useState(null);
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    getPublicRewardsInfo().then((response) => {
      if (response.success) setRewards(response);
    });
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem(SHOWN_KEY) === "1") return;

    const showTimer = setTimeout(() => {
      setVisible(true);
      sessionStorage.setItem(SHOWN_KEY, "1");
    }, SHOW_AFTER_MS);

    return () => clearTimeout(showTimer);
  }, []);

  useEffect(() => {
    if (!visible) return;

    const enterTimer = setTimeout(() => setEntered(true), 20);
    const closeTimer = setTimeout(handleClose, AUTO_CLOSE_AFTER_MS);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(closeTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => setVisible(false), 400);
  };

  if (!visible || !rewards) return null;

  return (
    <div
      className={`fixed bottom-5 right-5 z-[90] w-80 max-w-[calc(100vw-2.5rem)] bg-white border border-amber-200 rounded-xl shadow-2xl p-5 transition-all duration-400 ease-out ${
        entered && !closing
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-3"
      }`}
    >
      <button
        type="button"
        onClick={handleClose}
        aria-label="Close"
        className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"
      >
        <FaTimes />
      </button>

      <div className="flex items-center gap-3 mb-2">
        <span className="w-10 h-10 shrink-0 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-lg">
          <FaGift />
        </span>
        <span className="font-bold text-slate-800">Earn while you shop!</span>
      </div>

      <p className="text-sm text-slate-600 mb-4">
        Get 1 loyalty point for every ₹{rewards.loyalty.earnRate} you spend,
        redeemable on future orders. Plus, refer a friend and you both earn
        bonus points.
      </p>

      <Link
        to={isLoggedIn ? "/account" : "/register"}
        onClick={handleClose}
        className="block text-center bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-full py-2.5 transition-colors"
      >
        {isLoggedIn ? "See My Rewards" : "Sign Up & Start Earning"}
      </Link>
    </div>
  );
}

export default RewardsPromoPopup;
