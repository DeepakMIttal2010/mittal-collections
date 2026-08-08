import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { toast } from "react-toastify";
import { FaArrowLeft } from "react-icons/fa";
import { loginUser } from "../services/authService";
import { useAuth } from "../context/AuthContext";
import GoogleSignInButton from "../components/GoogleSignInButton";
import CompleteMobileModal from "../components/CompleteMobileModal";

function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";
  const { login } = useAuth();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [showMobileModal, setShowMobileModal] = useState(false);

  const handleGoogleResult = (data) => {
    login(data.user, data.token);

    if (data.needsMobile) {
      setShowMobileModal(true);
    } else {
      toast.success("Login Successful");
      navigate(redirectTo);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setLoading(true);

    try {
      const data = await loginUser(formData);

      if (data.success) {
        login(data.user, data.token);

        toast.success("Login Successful");

        navigate(redirectTo);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Login Failed");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-16 px-4">
      <div className="w-full max-w-md">
        <h1 className="text-5xl font-bold text-center text-slate-900 mb-10">
          Login
        </h1>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            required
            className="w-full bg-slate-100 rounded-lg px-5 py-4 mb-4 outline-none text-sm text-slate-800 placeholder:text-slate-500"
          />

          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            required
            className="w-full bg-slate-100 rounded-lg px-5 py-4 mb-4 outline-none text-sm text-slate-800 placeholder:text-slate-500"
          />

          <Link
            to="/forgot-password"
            className="text-sm text-slate-700 underline hover:text-amber-600 mb-8 block"
          >
            Forgot password?
          </Link>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full py-3.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>

            <Link
              to={`/register?redirect=${encodeURIComponent(redirectTo)}`}
              className="flex-1 border-2 border-blue-900 text-blue-900 hover:bg-blue-50 font-semibold rounded-full py-3.5 text-center transition-colors"
            >
              Create account
            </Link>
          </div>
        </form>

        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-xs text-slate-400 uppercase">or</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        <GoogleSignInButton onResult={handleGoogleResult} />

        <Link
          to="/"
          className="mt-10 flex items-center justify-center gap-2 text-sm text-slate-600 underline hover:text-amber-600"
        >
          <FaArrowLeft className="text-xs" />
          Return to Store
        </Link>
      </div>

      {showMobileModal && (
        <CompleteMobileModal
          onDone={() => {
            setShowMobileModal(false);
            navigate(redirectTo);
          }}
        />
      )}
    </div>
  );
}

export default Login;
