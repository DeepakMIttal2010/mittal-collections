import Wishlist from "../models/Wishlist.js";
import Product from "../models/Product.js";
import { sendEmail } from "../config/mailer.js";
import { notifyUser } from "../utils/notify.js";

// GET /api/wishlist
export const getWishlist = async (req, res) => {
  try {
    const wishlist = await Wishlist.find({ user: req.user._id }).populate({
      path: "product",
      populate: {
        path: "category",
        select: "name slug",
      },
    });

    res.status(200).json({
      success: true,
      wishlist,
    });
  } catch (error) {
    console.error("Get Wishlist Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// POST /api/wishlist
export const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;

    const exists = await Wishlist.findOne({
      user: req.user.id,
      product: productId,
    });

    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Product already in wishlist",
      });
    }

    const product = await Product.findById(productId).select("price");

    const wishlistItem = await Wishlist.create({
      user: req.user.id,
      product: productId,
      priceWhenAdded: product?.price ?? null,
    });

    res.status(201).json({
      success: true,
      wishlistItem,
    });
  } catch (error) {
    console.error("Add Wishlist Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// DELETE /api/wishlist/:productId
export const removeFromWishlist = async (req, res) => {
  try {
    const item = await Wishlist.findOneAndDelete({
      user: req.user.id,
      product: req.params.productId,
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Wishlist item not found",
      });
    }

    res.set("Cache-Control", "no-store");

    res.status(200).json({
      success: true,
      message: "Removed from wishlist",
    });
  } catch (error) {
    console.error("Remove Wishlist Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Guest wishlist (no login) — same shape as the logged-in endpoints
// above, keyed by the anonymous visitorId Cart/VisitTracker already use,
// instead of req.user. No price-drop emails for these (no account, no
// email) — sendPriceDropAlerts below already skips anything without a
// populated user.
// ============================

// GET /api/wishlist/guest/:visitorId
export const getGuestWishlist = async (req, res) => {
  try {
    const wishlist = await Wishlist.find({
      visitorId: req.params.visitorId,
    }).populate({
      path: "product",
      populate: {
        path: "category",
        select: "name slug",
      },
    });

    res.status(200).json({
      success: true,
      wishlist,
    });
  } catch (error) {
    console.error("Get Guest Wishlist Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// POST /api/wishlist/guest
export const addToGuestWishlist = async (req, res) => {
  try {
    const { visitorId, productId } = req.body;

    if (!visitorId) {
      return res.status(400).json({
        success: false,
        message: "visitorId is required",
      });
    }

    const exists = await Wishlist.findOne({ visitorId, product: productId });

    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Product already in wishlist",
      });
    }

    const product = await Product.findById(productId).select("price");

    const wishlistItem = await Wishlist.create({
      visitorId,
      product: productId,
      priceWhenAdded: product?.price ?? null,
    });

    res.status(201).json({
      success: true,
      wishlistItem,
    });
  } catch (error) {
    console.error("Add Guest Wishlist Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// DELETE /api/wishlist/guest/:visitorId/:productId
export const removeFromGuestWishlist = async (req, res) => {
  try {
    const item = await Wishlist.findOneAndDelete({
      visitorId: req.params.visitorId,
      product: req.params.productId,
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Wishlist item not found",
      });
    }

    res.set("Cache-Control", "no-store");

    res.status(200).json({
      success: true,
      message: "Removed from wishlist",
    });
  } catch (error) {
    console.error("Remove Guest Wishlist Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// DELETE /api/wishlist/guest/:visitorId
export const clearGuestWishlist = async (req, res) => {
  try {
    await Wishlist.deleteMany({ visitorId: req.params.visitorId });

    res.status(200).json({
      success: true,
      message: "Wishlist cleared successfully",
    });
  } catch (error) {
    console.error("Clear Guest Wishlist Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Merge a just-logged-in customer's guest wishlist (built up while they
// were browsing logged out) into their account — called once right after
// login, not on every page load. A product already on the account's own
// wishlist is left alone (the guest copy is just dropped) rather than
// erroring on the duplicate.
// ============================
export const mergeGuestWishlist = async (req, res) => {
  try {
    const { visitorId } = req.body;

    if (!visitorId) {
      return res.status(200).json({ success: true, merged: 0 });
    }

    const guestItems = await Wishlist.find({ visitorId });
    let merged = 0;

    for (const item of guestItems) {
      const alreadyOwned = await Wishlist.findOne({
        user: req.user._id,
        product: item.product,
      });

      if (alreadyOwned) {
        await item.deleteOne();
        continue;
      }

      item.user = req.user._id;
      item.visitorId = undefined;
      await item.save();
      merged += 1;
    }

    res.status(200).json({ success: true, merged });
  } catch (error) {
    console.error("Merge Guest Wishlist Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Price Drop Alerts — called by an external scheduler (cron-job.org),
// same secret-protected trigger pattern as sendAbandonedCartReminders and
// sendReviewRequestEmails.
// ============================
export const sendPriceDropAlerts = async (req, res) => {
  try {
    if (req.query.secret !== process.env.CRON_SECRET) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const candidates = await Wishlist.find({
      priceWhenAdded: { $ne: null },
    })
      .populate("user", "name email")
      .populate("product", "name slug price image");

    // Only a drop below whatever price we last actually alerted for (or the
    // price when added, if we've never alerted) counts — otherwise every
    // run would re-notify for the same still-lower price forever.
    const eligible = candidates.filter(({ user, product, lastAlertedPrice, priceWhenAdded }) => {
      if (!user?.email || !product) return false;
      const alertBaseline = lastAlertedPrice ?? priceWhenAdded;
      return product.price < alertBaseline;
    });

    let sent = 0;

    for (const item of eligible) {
      const { user, product } = item;
      const alertBaseline = item.lastAlertedPrice ?? item.priceWhenAdded;

      const url = `${process.env.CLIENT_URL}/product/${product._id}${
        product.slug ? `/${product.slug}` : ""
      }`;

      try {
        await sendEmail({
          to: user.email,
          subject: `Price drop: ${product.name} is now ₹${product.price}`,
          html: `
            <p>Hi ${user.name || "there"},</p>
            <p>Good news — an item on your wishlist just got cheaper:</p>
            <p><strong>${product.name}</strong><br/>
            Now ₹${product.price} (was ₹${alertBaseline})</p>
            <p><a href="${url}">View product</a></p>
          `,
        });

        notifyUser({
          userId: user._id,
          type: "price_drop",
          title: "Price drop on your wishlist item",
          message: `${product.name} is now ₹${product.price} (was ₹${alertBaseline}).`,
          link: `/product/${product._id}`,
        });

        item.lastAlertedPrice = product.price;
        await item.save();
        sent += 1;
      } catch (error) {
        console.error(`Price drop email failed for ${user.email}:`, error);
      }
    }

    res.status(200).json({
      success: true,
      message: `Sent ${sent} of ${eligible.length} price drop alerts`,
      sent,
      total: eligible.length,
    });
  } catch (error) {
    console.error("Send Price Drop Alerts Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

export const clearWishlist = async (req, res) => {
  try {
    await Wishlist.deleteMany({
      user: req.user._id,
    });

    res.status(200).json({
      success: true,
      message: "Wishlist cleared successfully",
    });
  } catch (error) {
    console.error("Clear Wishlist Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
