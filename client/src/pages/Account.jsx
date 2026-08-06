import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import {
  FaBoxOpen,
  FaHeart,
  FaUserEdit,
  FaLock,
  FaMapMarkerAlt,
  FaGift,
  FaUserFriends,
  FaCopy,
} from "react-icons/fa";
import { useAuth } from "../context/AuthContext";
import { getProfile } from "../services/authService";

const ACCOUNT_LINKS = [
  {
    to: "/my-orders",
    icon: FaBoxOpen,
    title: "Your Orders",
    description: "Track, view status and check your order history",
  },
  {
    to: "/wishlist",
    icon: FaHeart,
    title: "Wishlist",
    description: "View and manage items you've saved for later",
  },
  {
    to: "/addresses",
    icon: FaMapMarkerAlt,
    title: "Your Addresses",
    description: "Edit, remove or set a default address",
  },
  {
    to: "/edit-profile",
    icon: FaUserEdit,
    title: "Edit Profile",
    description: "Update your name and mobile number",
  },
  {
    to: "/change-password",
    icon: FaLock,
    title: "Change Password",
    description: "Update your account password",
  },
];

function Account() {
  const { user } = useAuth();
  const [loyaltyPoints, setLoyaltyPoints] = useState(user?.loyaltyPoints || 0);
  const [referralCode, setReferralCode] = useState(user?.referralCode || "");

  useEffect(() => {
    getProfile().then((response) => {
      if (response.success) {
        setLoyaltyPoints(response.user.loyaltyPoints || 0);
        setReferralCode(response.user.referralCode || "");
      }
    });
  }, []);

  const referralLink = referralCode
    ? `${window.location.origin}/register?ref=${referralCode}`
    : "";

  const handleCopyReferralLink = () => {
    navigator.clipboard.writeText(referralLink);
    toast.success("Referral link copied!");
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-slate-900 mb-1">Your Account</h1>
      <p className="text-slate-500 mb-6">Hi, {user?.name}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <Link
          to="/loyalty-history"
          className="flex items-center gap-4 bg-amber-50 border border-amber-200 rounded-xl p-5 hover:border-amber-400 transition-colors"
        >
          <span className="w-12 h-12 shrink-0 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-lg">
            <FaGift />
          </span>
          <span>
            <span className="block font-semibold text-slate-800">
              {loyaltyPoints} Loyalty Points
            </span>
            <span className="block text-sm text-slate-500 mt-0.5">
              Worth ₹{loyaltyPoints} — tap to see your points history
            </span>
          </span>
        </Link>

        {referralCode && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <div className="flex items-center gap-4 mb-3">
              <span className="w-12 h-12 shrink-0 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-lg">
                <FaUserFriends />
              </span>
              <span>
                <span className="block font-semibold text-slate-800">
                  Refer a Friend
                </span>
                <span className="block text-sm text-slate-500 mt-0.5">
                  You get 100 points, they get 50 — after their first order
                </span>
              </span>
            </div>

            <button
              type="button"
              onClick={handleCopyReferralLink}
              className="w-full flex items-center justify-between gap-2 bg-white border border-blue-300 rounded-lg px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 transition-colors"
            >
              <span className="truncate">{referralLink}</span>
              <FaCopy className="shrink-0" />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {ACCOUNT_LINKS.map(({ to, icon: Icon, title, description }) => (
          <Link
            key={to}
            to={to}
            className="flex gap-4 items-start bg-white border border-slate-200 rounded-xl p-5 hover:border-amber-400 hover:shadow-md transition-all"
          >
            <span className="w-12 h-12 shrink-0 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-lg">
              <Icon />
            </span>

            <span>
              <span className="block font-semibold text-slate-800">
                {title}
              </span>
              <span className="block text-sm text-slate-500 mt-1">
                {description}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default Account;
