import { useState } from "react";
import { FaTruck } from "react-icons/fa";

import { checkPincodeDelivery } from "../services/deliveryService";
import { useLanguage } from "../context/LanguageContext";

function PincodeChecker() {
  const { t } = useLanguage();
  const [pincode, setPincode] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);

  const handleCheck = async () => {
    if (!/^\d{6}$/.test(pincode)) {
      setResult({ type: "invalid" });
      return;
    }

    setChecking(true);
    const response = await checkPincodeDelivery(pincode);
    setChecking(false);

    if (!response.success) {
      setResult({ type: "error" });
    } else if (!response.found) {
      setResult({ type: "invalid" });
    } else if (response.fastDelivery) {
      setResult({ type: "fast", areaName: response.areaName });
    } else {
      setResult({ type: "standard" });
    }
  };

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-2">
        <FaTruck className="text-slate-400" />
        {t("Check delivery at your pincode", "अपने पिनकोड पर डिलीवरी जांचें")}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={pincode}
          onChange={(e) => {
            setPincode(e.target.value.replace(/\D/g, ""));
            setResult(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && handleCheck()}
          placeholder={t("Enter pincode", "पिनकोड डालें")}
          className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={handleCheck}
          disabled={checking || pincode.length !== 6}
          className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {checking ? "..." : t("Check", "जांचें")}
        </button>
      </div>

      {result?.type === "fast" && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-2">
          {t(
            `✅ Eligible for 24-Hour Express Delivery — ${result.areaName}`,
            `✅ 24 घंटे में एक्सप्रेस डिलीवरी के लिए योग्य — ${result.areaName}`,
          )}
        </p>
      )}

      {result?.type === "standard" && (
        <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mt-2">
          {t(
            "Standard delivery available (3-7 days)",
            "स्टैंडर्ड डिलीवरी उपलब्ध है (3-7 दिन)",
          )}
        </p>
      )}

      {(result?.type === "invalid" || result?.type === "error") && (
        <p className="text-xs text-red-600 mt-1.5">
          {t("That doesn't look like a valid pincode", "यह एक मान्य पिनकोड नहीं लगता")}
        </p>
      )}
    </div>
  );
}

export default PincodeChecker;
