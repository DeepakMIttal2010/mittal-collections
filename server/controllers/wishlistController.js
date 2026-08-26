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
