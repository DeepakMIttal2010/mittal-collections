import { useState } from "react";
import { toast } from "react-toastify";
import { subscribeToNewsletter } from "../../services/newsletterService";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Newsletter() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!EMAIL_REGEX.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setLoading(true);
    const response = await subscribeToNewsletter(email);
    setLoading(false);

    if (response.success) {
      toast.success(response.message || "Subscribed successfully");
      setEmail("");
    } else {
      toast.error(response.message || "Unable to subscribe");
    }
  };

  return (
    <section className="bg-gradient-to-br from-slate-800 to-slate-700 py-20 px-5 text-center">
      <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
        Stay Updated
      </h2>

      <p className="max-w-xl mx-auto text-slate-300 text-lg mb-8">
        Subscribe to receive the latest offers, discounts and new arrivals.
      </p>

      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap justify-center gap-4"
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email address"
          className="w-full max-w-sm px-6 py-3.5 rounded-full outline-none text-sm text-slate-800 bg-white placeholder:text-slate-400"
        />

        <button
          type="submit"
          disabled={loading}
          className="px-8 py-3.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? "Subscribing..." : "Subscribe"}
        </button>
      </form>
    </section>
  );
}

export default Newsletter;
