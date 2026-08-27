import { useState } from "react";
import { toast } from "react-toastify";
import { FaTimes } from "react-icons/fa";

import { createReturnRequest } from "../services/returnService";
import { useLanguage } from "../context/LanguageContext";

function ReturnRequestModal({ order, item, onClose, onSubmitted }) {
  const { t } = useLanguage();
  const [quantity, setQuantity] = useState(item.quantity);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!reason.trim()) {
      toast.error(t("Please tell us why you're returning this item", "कृपया बताएं कि आप इसे क्यों रिटर्न कर रहे हैं"));
      return;
    }

    setSubmitting(true);

    const response = await createReturnRequest({
      orderId: order._id,
      productId: item.product,
      quantity,
      reason,
    });

    setSubmitting(false);

    if (response.success) {
      toast.success(t("Return request submitted", "रिटर्न रिक्वेस्ट सबमिट हो गई"));
      onSubmitted();
      onClose();
    } else {
      toast.error(response.message || t("Unable to submit return request", "रिटर्न रिक्वेस्ट सबमिट नहीं हो सकी"));
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 relative"
      >
        <button
          onClick={onClose}
          aria-label={t("Close", "बंद करें")}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
          <FaTimes />
        </button>

        <h2 className="text-lg font-bold text-slate-900 mb-1">
          {t("Return this item", "यह आइटम रिटर्न करें")}
        </h2>
        <p className="text-sm text-slate-500 mb-4 line-clamp-2">
          {item.name}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {item.quantity > 1 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t("Quantity to return", "रिटर्न करने की मात्रा")}
              </label>
              <input
                type="number"
                min="1"
                max={item.quantity}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-24 border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t("Reason for return", "रिटर्न का कारण")}
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("e.g. Wrong size, damaged on arrival...", "जैसे: गलत साइज़, डिलीवरी पर खराब...")}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full py-2.5 transition-colors disabled:opacity-60"
          >
            {submitting ? t("Submitting...", "सबमिट हो रहा है...") : t("Submit Return Request", "रिटर्न रिक्वेस्ट सबमिट करें")}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ReturnRequestModal;
