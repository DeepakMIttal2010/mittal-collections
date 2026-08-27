import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { toast } from "react-toastify";
import { FaArrowLeft } from "react-icons/fa";
import { registerUser, verifyRegisterOtp } from "../services/authService";
import { subscribeToNewsletter } from "../services/newsletterService";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import GoogleSignInButton from "../components/GoogleSignInButton";
import CompleteMobileModal from "../components/CompleteMobileModal";

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
  const [showMobileModal, setShowMobileModal] = useState(false);
  const { login, markJustRegistered } = useAuth();
  const { t } = useLanguage();

  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const handleGoogleResult = (data) => {
    login(data.user, data.token);

    if (data.needsMobile) {
      setShowMobileModal(true);
    } else {
      toast.success(t("Signed in with Google", "Google से साइन इन हुआ"));
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
      if (formData.password !== formData.confirmPassword) {
        toast.error(t("Passwords do not match", "पासवर्ड मेल नहीं खाते"));
        setLoading(false);
        return;
      }

      const { confirmPassword, ...userData } = formData;

      const data = await registerUser(userData);

      if (data.success) {
        toast.success(
          t(
            "Verification code sent to your email",
            "आपके ईमेल पर वेरिफिकेशन कोड भेज दिया गया है",
          ),
        );
        setOtpStep(true);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.error(error);
      toast.error(t("Registration Failed", "रजिस्ट्रेशन नहीं हो पाया"));
    }

    setLoading(false);
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();

    setVerifying(true);

    try {
      const data = await verifyRegisterOtp(formData.email, otp);

      if (data.success) {
        toast.success(t("Registration Successful", "रजिस्ट्रेशन सफल हुआ"));
        markJustRegistered();

        if (subscribeNewsletter) {
          subscribeToNewsletter(formData.email);
        }

        navigate(`/login?redirect=${encodeURIComponent(redirectTo)}`);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.error(error);
      toast.error(t("Verification Failed", "वेरिफिकेशन नहीं हो पाया"));
    }

    setVerifying(false);
  };

  const handleResendOtp = async () => {
    setResending(true);

    try {
      const { confirmPassword, ...userData } = formData;
      const data = await registerUser(userData);

      if (data.success) {
        toast.success(t("Verification code resent", "वेरिफिकेशन कोड फिर से भेजा गया"));
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.error(error);
      toast.error(t("Unable to resend code", "कोड फिर से नहीं भेजा जा सका"));
    }

    setResending(false);
  };

  const inputClass =
    "w-full bg-slate-100 rounded-lg px-5 py-4 mb-4 outline-none text-sm text-slate-800 placeholder:text-slate-500";

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-16 px-4">
      <div className="w-full max-w-md">
        <h1 className="text-5xl font-bold text-center text-slate-900 mb-10">
          {otpStep
            ? t("Verify Your Email", "अपना ईमेल वेरिफाई करें")
            : t("Create Account", "खाता बनाएं")}
        </h1>

        {otpStep ? (
          <form onSubmit={handleVerifyOtp}>
            <p className="text-sm text-slate-600 mb-6 text-center">
              {t("We sent a 6-digit code to ", "हमने ")}
              <strong>{formData.email}</strong>
              {t(
                ". Enter it below to finish creating your account.",
                " पर 6 अंकों का कोड भेजा है। खाता बनाना पूरा करने के लिए इसे नीचे दर्ज करें।",
              )}
            </p>

            <input
              type="text"
              inputMode="numeric"
              placeholder={t("Enter 6-digit code", "6 अंकों का कोड दर्ज करें")}
              value={otp}
              onChange={(e) =>
                setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              maxLength={6}
              required
              autoFocus
              className={`${inputClass} text-center text-lg tracking-[0.5em]`}
            />

            <button
              type="submit"
              disabled={verifying || otp.length !== 6}
              className="w-full bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full py-3.5 mt-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {verifying
                ? t("Verifying...", "वेरिफाई हो रहा है...")
                : t("Verify & Create Account", "वेरिफाई करें और खाता बनाएं")}
            </button>

            <div className="flex items-center justify-between mt-4 text-sm">
              <button
                type="button"
                onClick={() => setOtpStep(false)}
                className="text-slate-500 underline hover:text-slate-700"
              >
                {t("Change details", "जानकारी बदलें")}
              </button>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resending}
                className="text-blue-700 underline hover:text-blue-900 disabled:opacity-60"
              >
                {resending
                  ? t("Resending...", "फिर से भेजा जा रहा है...")
                  : t("Resend code", "कोड फिर से भेजें")}
              </button>
            </div>
          </form>
        ) : (
          <>
            <GoogleSignInButton onResult={handleGoogleResult} />

            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 uppercase">{t("or", "या")}</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            <form onSubmit={handleSubmit}>
              <input
                type="text"
                name="name"
                placeholder={t("Full Name", "पूरा नाम")}
                value={formData.name}
                onChange={handleChange}
                required
                className={inputClass}
              />

              <input
                type="email"
                name="email"
                placeholder={t("Email", "ईमेल")}
                value={formData.email}
                onChange={handleChange}
                required
                className={inputClass}
              />

              <input
                type="tel"
                name="mobile"
                placeholder={t("Mobile Number", "मोबाइल नंबर")}
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
                placeholder={t("Password", "पासवर्ड")}
                value={formData.password}
                onChange={handleChange}
                required
                className={inputClass}
              />

              <input
                type="password"
                name="confirmPassword"
                placeholder={t("Confirm Password", "पासवर्ड की पुष्टि करें")}
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                className={inputClass}
              />

              <input
                type="text"
                name="referralCode"
                placeholder={t("Referral Code (optional)", "रेफरल कोड (वैकल्पिक)")}
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
                {t("Register to our newsletter", "हमारे न्यूज़लेटर के लिए रजिस्टर करें")}
              </label>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full py-3.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading
                    ? t("Creating Account...", "खाता बनाया जा रहा है...")
                    : t("Register", "रजिस्टर करें")}
                </button>

                <Link
                  to={`/login?redirect=${encodeURIComponent(redirectTo)}`}
                  className="flex-1 border-2 border-blue-900 text-blue-900 hover:bg-blue-50 font-semibold rounded-full py-3.5 text-center transition-colors"
                >
                  {t("Login", "लॉगिन")}
                </Link>
              </div>
            </form>
          </>
        )}

        <Link
          to="/"
          className="mt-10 flex items-center justify-center gap-2 text-sm text-slate-600 underline hover:text-amber-600"
        >
          <FaArrowLeft className="text-xs" />
          {t("Return to Store", "स्टोर पर वापस जाएं")}
        </Link>
      </div>

      {showMobileModal && (
        <CompleteMobileModal
          onDone={() => {
            setShowMobileModal(false);
            // Brand-new Google account (see CompleteMobileModal) — send
            // them to their account page to confirm the profile is set
            // up, rather than wherever `redirectTo` happened to point
            // (usually just "/").
            navigate("/account");
          }}
        />
      )}
    </div>
  );
}

export default Register;
