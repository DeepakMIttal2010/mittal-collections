import { useEffect, useRef } from "react";
import { toast } from "react-toastify";
import { googleSignIn } from "../services/authService";
import { useLanguage } from "../context/LanguageContext";

const GOOGLE_CLIENT_ID =
  "382416024276-qeo7hdk173590ni1d0lr14kjvrierep7.apps.googleusercontent.com";

let scriptLoadPromise = null;

const loadGoogleScript = () => {
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
};

// Renders Google's own "Sign in with Google" button. On success, sends
// the credential to our backend and hands the resulting {success, ...}
// response to onResult — the caller decides what to do next (log in +
// navigate, or prompt for a missing mobile number on first sign-up).
function GoogleSignInButton({ onResult }) {
  const buttonRef = useRef(null);
  const { t } = useLanguage();

  useEffect(() => {
    let cancelled = false;

    loadGoogleScript().then(() => {
      if (cancelled || !buttonRef.current) return;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          const data = await googleSignIn(response.credential);

          if (!data.success) {
            toast.error(data.message || t("Google sign-in failed", "Google साइन-इन नहीं हो पाया"));
            return;
          }

          onResult(data);
        },
      });

      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        width: 360,
        text: "continue_with",
      });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={buttonRef} className="flex justify-center" />;
}

export default GoogleSignInButton;
