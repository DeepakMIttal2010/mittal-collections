import { resumeRazorpayPayment, verifyRazorpayPayment } from "../services/orderService";

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
export const resumeOrderPayment = async ({
  orderId,
  user,
  onSuccess,
  onFailure,
  onDismiss,
}) => {
  const scriptLoaded = await loadRazorpayScript();

  if (!scriptLoaded) {
    onFailure("Unable to load the payment gateway. Please check your connection.");
    return;
  }

  const response = await resumeRazorpayPayment(orderId);

  if (!response?.success) {
    onFailure(response?.message || "Unable to resume payment.");
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
        onSuccess();
      } else {
        onFailure(
          "Payment received, but verification failed. Please contact support.",
        );
      }
    },
    modal: {
      ondismiss: () => onDismiss?.(),
    },
  });

  razorpay.on("payment.failed", () => {
    onFailure("Payment failed — you can try again.");
  });

  razorpay.open();
};
