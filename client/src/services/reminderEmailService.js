import API_BASE_URL from "./api";

// Opt out of cart-reminder and wishlist price-drop emails using the
// random token from a reminder email's link (no login).
export const optOutOfReminderEmails = async (token) => {
  try {
    const response = await fetch(`${API_BASE_URL}/reminder-emails/opt-out`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    const data = await response.json();

    return {
      success: data.success,
      message: data.message,
    };
  } catch (error) {
    console.error("Reminder Email Opt-out Error:", error.message);

    return {
      success: false,
      message: "",
    };
  }
};
