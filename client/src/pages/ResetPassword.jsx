import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { FaArrowLeft } from "react-icons/fa";
import { resetPassword } from "../services/authService";

function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    const data = await resetPassword(token, password);
    setLoading(false);

    if (data.success) {
      toast.success("Password reset successfully");
      navigate("/login");
    } else {
      toast.error(data.message || "Unable to reset password");
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-16 px-4">
      <div className="w-full max-w-md">
        <h1 className="text-5xl font-bold text-center text-slate-900 mb-3">
          Reset password
        </h1>

        <p className="text-center text-slate-600 mb-8">
          Enter your new password below.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="New Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full bg-slate-100 rounded-lg px-5 py-4 mb-4 outline-none text-sm text-slate-800 placeholder:text-slate-500"
          />

          <input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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

export default ResetPassword;
