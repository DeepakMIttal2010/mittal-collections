import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { FaPlus } from "react-icons/fa";
import {
  getAddresses,
  deleteAddress,
  setDefaultAddress,
} from "../services/addressService";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

function Addresses() {
  const { isLoggedIn } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAddresses = useCallback(async () => {
    const data = await getAddresses();

    if (data.success) {
      setAddresses(data.addresses);
    } else {
      toast.error(data.message || t("Unable to load addresses", "पते लोड नहीं हो सके"));
    }

    setLoading(false);
  }, [t]);

  useEffect(() => {
    if (!isLoggedIn) {
      navigate("/login?redirect=/addresses");
      return;
    }

    loadAddresses();
  }, [isLoggedIn, navigate, loadAddresses]);

  const handleRemove = async (id) => {
    const data = await deleteAddress(id);

    if (data.success) {
      toast.success(t("Address removed", "पता हटा दिया गया"));
      loadAddresses();
    } else {
      toast.error(data.message || t("Unable to remove address", "पता नहीं हटाया जा सका"));
    }
  };

  const handleSetDefault = async (id) => {
    const data = await setDefaultAddress(id);

    if (data.success) {
      toast.success(t("Default address updated", "डिफ़ॉल्ट पता अपडेट हो गया"));
      loadAddresses();
    } else {
      toast.error(data.message || t("Unable to update default address", "डिफ़ॉल्ट पता अपडेट नहीं हो सका"));
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="text-sm mb-2">
        <Link to="/account" className="text-blue-700 hover:underline">
          {t("Your Account", "आपका खाता")}
        </Link>
        <span className="text-slate-400 mx-2">›</span>
        <span className="text-amber-600 font-medium">{t("Your Addresses", "आपके पते")}</span>
      </div>

      <h1 className="text-3xl font-bold text-slate-900 mb-6">
        {t("Your Addresses", "आपके पते")}
      </h1>

      {loading ? (
        <p className="text-slate-500">{t("Loading...", "लोड हो रहा है...")}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <Link
            to="/addresses/add"
            className="min-h-[220px] border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-500 hover:border-amber-500 hover:text-amber-600 transition-colors"
          >
            <FaPlus className="text-2xl" />
            <span className="font-semibold">{t("Add Address", "पता जोड़ें")}</span>
          </Link>

          {addresses.map((addr) => (
            <div
              key={addr._id}
              className="border border-slate-200 rounded-xl p-5 bg-white flex flex-col"
            >
              {addr.isDefault && (
                <span className="self-start text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded mb-2">
                  {t("Default", "डिफ़ॉल्ट")}
                </span>
              )}

              <p className="font-semibold text-slate-800">{addr.fullName}</p>
              <p className="text-sm text-slate-600 mt-1">
                {addr.address}
                {addr.unit ? `, ${addr.unit}` : ""}
              </p>
              <p className="text-sm text-slate-600">
                {addr.city}, {addr.state} {addr.pincode}
              </p>
              <p className="text-sm text-slate-600">{addr.country}</p>
              <p className="text-sm text-slate-600 mt-1">
                {t("Phone number: ", "फ़ोन नंबर: ")}{addr.mobile}
              </p>

              <div className="flex items-center gap-3 mt-4 text-sm">
                <Link
                  to={`/addresses/edit/${addr._id}`}
                  className="text-blue-700 hover:underline"
                >
                  {t("Edit", "एडिट करें")}
                </Link>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => handleRemove(addr._id)}
                  className="text-blue-700 hover:underline"
                >
                  {t("Remove", "हटाएं")}
                </button>
                {!addr.isDefault && (
                  <>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => handleSetDefault(addr._id)}
                      className="text-blue-700 hover:underline"
                    >
                      {t("Set as Default", "डिफ़ॉल्ट के रूप में सेट करें")}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Addresses;
