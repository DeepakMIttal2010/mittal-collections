import { useState } from "react";
import { toast } from "react-toastify";
import { updateProfile } from "../services/authService";
import { useAuth } from "../context/AuthContext";

// Shown right after a Google sign-in that created a brand-new account —
// Google doesn't provide a phone number, but the rest of the app (order
// delivery, SMS-style contact) assumes every user has one. The fuller
// congratulations + benefits message is left to WelcomeBenefitsPopup
// (triggered via markJustRegistered below) rather than duplicated here.
function CompleteMobileModal({ onDone }) {
  const { user, updateUser, markJustRegistered } = useAuth();
  const [mobile, setMobile] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!/^[6-9]\d{9}$/.test(mobile)) {
      setError("Enter a valid 10-digit mobile number");
      return;
    }

    setSaving(true);

    const response = await updateProfile(user.name, mobile);

    if (response.success) {
      updateUser({ mobile });
      toast.success("Mobile number saved");
      markJustRegistered();
      onDone();
    } else {
      setError(response.message || "Unable to save mobile number");
    }

    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm">
        <h2 className="text-xl font-bold text-slate-900 mb-2">
          One last thing
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          Add your mobile number so we can keep you updated on your orders.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="tel"
            placeholder="Mobile Number"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            maxLength={10}
            className="w-full bg-slate-100 rounded-lg px-5 py-4 mb-2 outline-none text-sm text-slate-800 placeholder:text-slate-500"
            autoFocus
          />
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full py-3.5 mt-3 transition-colors disabled:opacity-60"
          >
            {saving ? "Saving..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default CompleteMobileModal;
