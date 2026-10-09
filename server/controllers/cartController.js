import CartSnapshot from "../models/CartSnapshot.js";
import { sendEmail } from "../config/mailer.js";
import { isValidVisitorId } from "../utils/isValidVisitorId.js";
import { escapeHtml } from "../utils/escapeHtml.js";

const REMINDER_DELAY_HOURS = 3;

// ============================
// Sync Cart Snapshot (logged-in users only)
// Fire-and-forget from the frontend whenever the cart changes. Used
// purely to detect abandoned carts — not read back by the cart UI.
// ============================
// Reconstructed explicitly, field by field, rather than passing req.body's
// items straight into a Mongo write — CartSnapshot's schema would cast an
// array of plain objects fine either way, but an explicit allowlist is
// what this codebase already does everywhere else a request body feeds a
// write (see adminProductApi.mjs's buildProductUpdateFormData), and is
// what satisfies a static query-injection scanner that can't see that
// Mongoose casting already defuses this for a typed subdocument array.
const sanitizeCartItems = (items) =>
  (Array.isArray(items) ? items : []).map((item) => ({
    product: item?.product,
    name: item?.name,
    image: item?.image,
    // Coerced (not just passed through) since this value later renders
    // straight into the abandoned-cart reminder email -- a missing or
    // malformed price/quantity would otherwise persist as undefined and
    // show up as a literal "₹NaN" in that email rather than a sane 0.
    price: Number(item?.price) || 0,
    quantity: Number(item?.quantity) || 0,
  }));

// A product id + quantity signature, independent of item order — used to
// tell a genuinely-changed cart apart from the same cart being re-synced
// unchanged (e.g. a logged-in customer just browsing other pages with
// items already sitting in their cart). Price/name/image are intentionally
// excluded: those can drift (a price change, say) without the customer
// having done anything, and shouldn't by themselves count as new activity.
const cartSignature = (items) =>
  (items || [])
    .map((item) => `${item.product}:${item.quantity}`)
    .sort()
    .join("|");

export const syncCart = async (req, res) => {
  try {
    const items = sanitizeCartItems(req.body.items);

    if (items.length === 0) {
      await CartSnapshot.deleteOne({ user: req.user._id });

      return res.status(200).json({ success: true });
    }

    const existing = await CartSnapshot.findOne({ user: req.user._id });
    // Only clear reminderSentAt when the cart actually changed — a sync
    // call fires on every mount while items sit untouched in localStorage
    // (e.g. just browsing other pages while logged in), and unconditionally
    // resetting this here let an already-reminded, unchanged cart look
    // brand new again, re-triggering the same reminder email indefinitely
    // every time the 3-hour cron job next ran.
    const cartChanged = !existing || cartSignature(existing.items) !== cartSignature(items);

    await CartSnapshot.findOneAndUpdate(
      { user: req.user._id },
      cartChanged ? { items, reminderSentAt: null } : { items },
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
    const { visitorId } = req.body;
    const items = sanitizeCartItems(req.body.items);

    // Must be a plain, reasonably-bounded string, not just truthy — an
    // object here (e.g. { "$gt": "" }) would otherwise be passed
    // straight into the Mongo queries below as a query operator
    // instead of a literal value, and an unbounded string could hit
    // CartSnapshot's unique index on visitorId with an oversized key.
    if (!isValidVisitorId(visitorId)) {
      return res.status(400).json({
        success: false,
        message: "visitorId is required",
      });
    }

    if (items.length === 0) {
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

    // Same guard as syncGuestCart.
    if (isValidVisitorId(visitorId)) {
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

      // item.name comes straight from CartSnapshot.items, which syncCart
      // persists from req.body with no server-side re-derivation (unlike
      // order placement, which re-verifies every item against the DB) —
      // so it's fully attacker-controlled free text and must be escaped
      // the same as cart.user.name below.
      const itemsHtml = cart.items
        .map(
          (item) =>
            `<li>${escapeHtml(item.name)} × ${item.quantity} — ₹${item.price * item.quantity}</li>`,
        )
        .join("");

      try {
        await sendEmail({
          to: cart.user.email,
          subject: "You left something in your cart",
          html: `
            <p>Hi ${escapeHtml(cart.user.name || "there")},</p>
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
