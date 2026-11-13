import User from "../models/User.js";
import { isReminderOptOutTokenShape } from "../utils/reminderOptOut.js";

// ============================
// OPT OUT OF REMINDER EMAILS (no login)
// The random token from a reminder email's unsubscribe link identifies
// the account (see utils/reminderOptOut.js). Only reached by an explicit
// POST from the confirmation page, never by opening the link itself, so
// an email scanner prefetching the link changes nothing. Idempotent:
// repeating it simply succeeds again.
// ============================
export const optOutOfReminderEmails = async (req, res) => {
  try {
    const { token } = req.body;

    if (!isReminderOptOutTokenShape(token)) {
      return res.status(400).json({
        success: false,
        message: "This unsubscribe link is invalid",
      });
    }

    const result = await User.updateOne(
      { reminderOptOutToken: token },
      { $set: { reminderEmailsOptOut: true } },
    );

    if (result.matchedCount === 0) {
      return res.status(400).json({
        success: false,
        message: "This unsubscribe link is invalid",
      });
    }

    res.status(200).json({
      success: true,
      message: "You won't receive cart reminder, wishlist price-drop, or review and feedback emails",
    });
  } catch (error) {
    console.error("Reminder Email Opt-out Error:", error.message);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
