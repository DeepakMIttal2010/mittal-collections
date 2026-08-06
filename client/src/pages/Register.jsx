import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { toast } from "react-toastify";
import { FaArrowLeft } from "react-icons/fa";
import { registerUser } from "../services/authService";
import { subscribeToNewsletter } from "../services/newsletterService";

function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";
  const refFromUrl = searchParams.get("ref") || "";

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    mobile: "",
    password: "",
    confirmPassword: "",
    referralCode: refFromUrl,
  });

  const [subscribeNewsletter, setSubscribeNewsletter] = useState(false);
  const [loading, setLoading] = useState(false);

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
      if (formData.password !== formData.confirmPassword) {
        toast.error("Passwords do not match");
        setLoading(false);
        return;
      }

      const { confirmPassword, ...userData } = formData;

      const data = await registerUser(userData);

      if (data.success) {
        toast.success("Registration Successful");

        if (subscribeNewsletter) {
          subscribeToNewsletter(formData.email);
        }

        navigate(`/login?redirect=${encodeURIComponent(redirectTo)}`);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Registration Failed");
    }

    setLoading(false);
  };

  const inputClass =
    "w-full bg-slate-100 rounded-lg px-5 py-4 mb-4 outline-none text-sm text-slate-800 placeholder:text-slate-500";

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-16 px-4">
      <div className="w-full max-w-md">
        <h1 className="text-5xl font-bold text-center text-slate-900 mb-10">
          Create Account
        </h1>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            name="name"
            placeholder="Full Name"
            value={formData.name}
            onChange={handleChange}
            required
            className={inputClass}
          />

          <input
            type="email"
            name="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            required
            className={inputClass}
          />

          <input
            type="tel"
            name="mobile"
            placeholder="Mobile Number"
            value={formData.mobile}
            onChange={handleChange}
            maxLength={10}
            pattern="[0-9]{10}"
            required
            className={inputClass}
          />

          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            required
            className={inputClass}
          />

          <input
            type="password"
            name="confirmPassword"
            placeholder="Confirm Password"
            value={formData.confirmPassword}
            onChange={handleChange}
            required
            className={inputClass}
          />

          <input
            type="text"
            name="referralCode"
            placeholder="Referral Code (optional)"
            value={formData.referralCode}
            onChange={(e) =>
              setFormData({
                ...formData,
                referralCode: e.target.value.toUpperCase(),
              })
            }
            className={inputClass}
          />

          <label className="flex items-center gap-2 mb-8 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={subscribeNewsletter}
              onChange={(e) => setSubscribeNewsletter(e.target.checked)}
              className="w-4 h-4 accent-blue-900"
            />
            Register to our newsletter
          </label>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full py-3.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Creating Account..." : "Register"}
            </button>

            <Link
              to={`/login?redirect=${encodeURIComponent(redirectTo)}`}
              className="flex-1 border-2 border-blue-900 text-blue-900 hover:bg-blue-50 font-semibold rounded-full py-3.5 text-center transition-colors"
            >
              Login
            </Link>
          </div>
        </form>

        <Link
          to="/"
          className="mt-10 flex items-center justify-center gap-2 text-sm text-slate-600 underline hover:text-amber-600"
        >
          <FaArrowLeft className="text-xs" />
          Return to Store
        </Link>
      </div>
    </div>
  );
}

export default Register;
