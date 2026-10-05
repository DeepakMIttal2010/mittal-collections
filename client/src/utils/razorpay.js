import { resumeRazorpayPayment, verifyRazorpayPayment } from "../services/orderService";
import { trackPurchase } from "./analytics";

// Loaded on-demand rather than globally in index.html, so pages that
// never reach payment don't pay for it. Shared by Checkout (creating a
// new order) and the "Pay Now" retry flow (resuming an existing one).
let razorpayScriptPromise = null;
export const loadRazorpayScript = () => {
  if (window.Razorpay) return Promise.resolve(true);

  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  return razorpayScriptPromise;
};

// Re-opens Razorpay checkout for an order that was already created but
// never paid (modal dismissed, bank timeout, payment failed, etc.) —
// used by the "Pay Now" button on My Orders / Order Details, never by
// Checkout itself (which creates a fresh order via createOrder).
//
// `t` is the caller's `useLanguage()` translator, passed in because this
// is a plain util module with no hook access of its own — Checkout.jsx's
// own Razorpay flow (built inline in that component, where `t` is
// already in scope) wraps every one of these same messages in `t(en,
// hi)`; this resume path previously didn't, so a Hindi-mode customer
// retrying a failed/stuck payment saw English-only error toasts.
export const resumeOrderPayment = async ({
  orderId,
  user,
  t,
  onSuccess,
  onFailure,
  onDismiss,
}) => {
  const scriptLoaded = await loadRazorpayScript();

  if (!scriptLoaded) {
    onFailure(
      t(
        "Unable to load the payment gateway. Please check your connection.",
        "पेमेंट गेटवे लोड नहीं हो पाया। कृपया अपना कनेक्शन जांचें।",
      ),
    );
    return;
  }

  const response = await resumeRazorpayPayment(orderId);

  if (!response?.success) {
    onFailure(
      response?.message || t("Unable to resume payment.", "पेमेंट resume नहीं हो पाया।"),
    );
    return;
  }

  const razorpay = new window.Razorpay({
    key: response.razorpayKeyId,
    amount: response.razorpayOrder.amount,
    currency: response.razorpayOrder.currency,
    order_id: response.razorpayOrder.id,
    name: "Mittal Collections",
    description: "Order Payment",
    prefill: {
      name: user?.name || "",
      contact: user?.mobile || "",
      email: user?.email || "",
    },
    theme: { color: "#1e3a8a" },
    handler: async (razorpayResponse) => {
      const verifyResponse = await verifyRazorpayPayment({
        orderId,
        razorpay_order_id: razorpayResponse.razorpay_order_id,
        razorpay_payment_id: razorpayResponse.razorpay_payment_id,
        razorpay_signature: razorpayResponse.razorpay_signature,
      });

      if (verifyResponse.success) {
        // This is a genuinely completed sale — same as the first-time
        // Checkout.jsx flow, just reached via a retried/resumed payment
        // instead. verifyResponse.order (the server's confirmed order,
        // with its real line items) is what makes this possible here:
        // there's no live cart to build a purchase event from on this
        // page. See trackPurchase's own comment for why this path used
        // to silently undercount GA4 revenue.
        trackPurchase(verifyResponse.order);
        onSuccess();
      } else {
        onFailure(
          t(
            "Payment received, but verification failed. Please contact support.",
            "पेमेंट मिल गया, लेकिन verify नहीं हो पाया। कृपया सपोर्ट से संपर्क करें।",
          ),
        );
      }
    },
    modal: {
      ondismiss: () => onDismiss?.(),
    },
  });

  razorpay.on("payment.failed", () => {
    onFailure(t("Payment failed — you can try again.", "पेमेंट नहीं हो पाया — आप दोबारा कोशिश कर सकते हैं।"));
  });

  razorpay.open();
};
