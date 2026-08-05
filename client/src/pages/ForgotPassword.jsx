import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { FaArrowLeft } from "react-icons/fa";
import { forgotPassword } from "../services/authService";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    setLoading(true);
    setSent(false);

    const data = await forgotPassword(email);

    if (data.success) {
      setSent(true);
      toast.success("Reset link sent to your email");
    } else {
      toast.error(data.message || "Unable to send reset link");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-16 px-4">
      <div className="w-full max-w-md">
        <h1 className="text-5xl font-bold text-center text-slate-900 mb-3">
          Reset password
        </h1>

        <p className="text-center text-slate-600 mb-8">
          We will send you an email to reset your password.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full bg-slate-100 rounded-lg px-5 py-4 mb-6 outline-none text-sm text-slate-800 placeholder:text-slate-500"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full py-3.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Submitting..." : "Submit"}
          </button>
        </form>

        {sent && (
          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-slate-700">
            Check your inbox — we've emailed you a link to reset your
            password. It expires in 30 minutes.
          </div>
        )}

        <Link
          to="/login"
          className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-600 underline hover:text-amber-600"
        >
          <FaArrowLeft className="text-xs" />
          Cancel
        </Link>
      </div>
    </div>
  );
}

export default ForgotPassword;
