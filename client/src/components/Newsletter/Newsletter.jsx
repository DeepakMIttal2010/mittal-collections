import { useState } from "react";
import { toast } from "react-toastify";
import { subscribeToNewsletter } from "../../services/newsletterService";
import { useLanguage } from "../../context/LanguageContext";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Newsletter() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const { t } = useLanguage();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!EMAIL_REGEX.test(email)) {
      toast.error(t("Please enter a valid email address", "कृपया एक मान्य ईमेल पता दर्ज करें"));
      return;
    }

    setLoading(true);
    const response = await subscribeToNewsletter(email);
    setLoading(false);

    if (response.success) {
      toast.success(response.message || t("Subscribed successfully", "सफलतापूर्वक सब्सक्राइब हो गया"));
      setEmail("");
    } else {
      toast.error(response.message || t("Unable to subscribe", "सब्सक्राइब नहीं हो सका"));
    }
  };

  return (
    <section className="bg-gradient-to-br from-slate-800 to-slate-700 py-20 px-5 text-center">
      <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
        {t("Stay Updated", "अपडेट रहें")}
      </h2>

      <p className="max-w-xl mx-auto text-slate-300 text-lg mb-8">
        {t(
          "Subscribe to receive the latest offers, discounts and new arrivals.",
          "नवीनतम ऑफ़र, छूट और नए प्रोडक्ट्स की जानकारी पाने के लिए सब्सक्राइब करें।",
        )}
      </p>

      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap justify-center gap-4"
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("Enter your email address", "अपना ईमेल पता दर्ज करें")}
          className="w-full max-w-sm px-6 py-3.5 rounded-full outline-none text-sm text-slate-800 bg-white placeholder:text-slate-400"
        />

        <button
          type="submit"
          disabled={loading}
          className="px-8 py-3.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? t("Subscribing...", "सब्सक्राइब हो रहा है...") : t("Subscribe", "सब्सक्राइब करें")}
        </button>
      </form>
    </section>
  );
}

export default Newsletter;
