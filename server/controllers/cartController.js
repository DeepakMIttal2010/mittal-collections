import CartSnapshot from "../models/CartSnapshot.js";
import { sendEmail } from "../config/mailer.js";

const REMINDER_DELAY_HOURS = 3;

// ============================
// Sync Cart Snapshot (logged-in users only)
// Fire-and-forget from the frontend whenever the cart changes. Used
// purely to detect abandoned carts — not read back by the cart UI.
// ============================
export const syncCart = async (req, res) => {
  try {
    const { items } = req.body;

    if (!items || items.length === 0) {
      await CartSnapshot.deleteOne({ user: req.user._id });

      return res.status(200).json({ success: true });
    }

    await CartSnapshot.findOneAndUpdate(
      { user: req.user._id },
      { items, reminderSentAt: null },
      { upsert: true, new: true },
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Sync Cart Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Sync Cart Snapshot (guests — anonymous localStorage visitorId)
// Same purpose as syncCart above, keyed by visitorId instead of a user
// account so product-wise cart-engagement counts (see
// adminController.js's getProductEngagement) aren't blind to the many
// customers who never log in. Guests have no email, so this never
// factors into the abandoned-cart reminder — that stays user-only.
// ============================
export const syncGuestCart = async (req, res) => {
  try {
    const { visitorId, items } = req.body;

    if (!visitorId) {
      return res.status(400).json({
        success: false,
        message: "visitorId is required",
      });
    }

    if (!items || items.length === 0) {
      await CartSnapshot.deleteOne({ visitorId });

      return res.status(200).json({ success: true });
    }

    await CartSnapshot.findOneAndUpdate(
      { visitorId },
      { items },
      { upsert: true, new: true },
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Sync Guest Cart Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Merge a just-logged-in customer's guest cart snapshot into their
// account — called once right after login, mirroring
// wishlistController.js's mergeGuestWishlist. Unlike the wishlist,
// there's no item-by-item merge to do here: the actual cart contents
// already live in the browser's localStorage and carry over on their
// own regardless of login state, and syncCart (fired right after this
// by CartContext) will shortly write the current items under the
// user's own snapshot anyway. This just deletes the now-redundant
// guest snapshot — without it, the guest doc lingers forever as a
// permanently-stale duplicate, double-counting that customer's cart in
// getProductEngagement's cartCount and showing up as a phantom
// abandoned guest cart that can never actually be reminded about.
// ============================
export const mergeGuestCart = async (req, res) => {
  try {
    const { visitorId } = req.body;

    if (visitorId) {
      await CartSnapshot.deleteOne({ visitorId });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Merge Guest Cart Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Send Abandoned Cart Reminders
// Called by an external scheduler (not a logged-in admin session),
// protected by a shared secret rather than JWT auth.
// ============================
export const sendAbandonedCartReminders = async (req, res) => {
  try {
    if (req.query.secret !== process.env.CRON_SECRET) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const cutoff = new Date(Date.now() - REMINDER_DELAY_HOURS * 60 * 60 * 1000);

    // user: not null — a guest snapshot has no email to remind, so it's
    // excluded up front rather than fetched and populated only to be
    // skipped below.
    const abandoned = await CartSnapshot.find({
      user: { $ne: null },
      updatedAt: { $lte: cutoff },
      reminderSentAt: null,
    }).populate("user", "name email");

    let sent = 0;

    for (const cart of abandoned) {
      if (!cart.user?.email || cart.items.length === 0) continue;

      const itemsHtml = cart.items
        .map(
          (item) =>
            `<li>${item.name} × ${item.quantity} — ₹${item.price * item.quantity}</li>`,
        )
        .join("");

      try {
        await sendEmail({
          to: cart.user.email,
          subject: "You left something in your cart",
          html: `
            <p>Hi ${cart.user.name || "there"},</p>
            <p>You still have items waiting in your cart at Mittal Collections:</p>
            <ul>${itemsHtml}</ul>
            <p><a href="${process.env.CLIENT_URL}/cart">Complete your order</a></p>
          `,
        });

        cart.reminderSentAt = new Date();
        await cart.save();
        sent += 1;
      } catch (error) {
        console.error(`Abandoned cart email failed for ${cart.user.email}:`, error);
      }
    }

    res.status(200).json({
      success: true,
      message: `Sent ${sent} of ${abandoned.length} reminders`,
      sent,
      total: abandoned.length,
    });
  } catch (error) {
    console.error("Send Abandoned Cart Reminders Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
