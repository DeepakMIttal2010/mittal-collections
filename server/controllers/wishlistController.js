import mongoose from "mongoose";

import Wishlist from "../models/Wishlist.js";
import Product from "../models/Product.js";
import { sendEmail } from "../config/mailer.js";
import { notifyUser } from "../utils/notify.js";
import { isValidVisitorId } from "../utils/isValidVisitorId.js";
import { escapeHtml } from "../utils/escapeHtml.js";
import { COST_FIELDS } from "../utils/productCostFields.js";

// Keeps a single account/guest from growing an unbounded wishlist
// (accidental or scripted) — well above any real shopper's use, just a
// sane ceiling.
const MAX_WISHLIST_ITEMS = 200;

// GET /api/wishlist
export const getWishlist = async (req, res) => {
  try {
    // Without an explicit sort this fell back to Mongo's natural/insertion
    // order, which isn't guaranteed stable — a shopper could see their own
    // wishlist reorder itself between visits with no action on their part.
    // Newest-added-first matches how every other "my saved items" list on
    // the site behaves.
    const wishlist = await Wishlist.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate({
        path: "product",
        // the guest route needs no login at all -- without this every
        // product's purchase price and admin remarks were readable
        select: COST_FIELDS,
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

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "A valid productId is required",
      });
    }

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

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const itemCount = await Wishlist.countDocuments({ user: req.user.id });

    if (itemCount >= MAX_WISHLIST_ITEMS) {
      return res.status(400).json({
        success: false,
        message: `Wishlist is full (max ${MAX_WISHLIST_ITEMS} items) — remove something first`,
      });
    }

    const wishlistItem = await Wishlist.create({
      user: req.user.id,
      product: productId,
      priceWhenAdded: product.price ?? null,
    });

    res.status(201).json({
      success: true,
      wishlistItem,
    });
  } catch (error) {
    // The unique partial index on {user, product} (see Wishlist.js) is
    // what actually stops two concurrent add requests for the same
    // item from both succeeding — the findOne check above can't fully
    // close that race. Surface the loser's duplicate-key error as the
    // same message the check above gives, not a generic 500.
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Product already in wishlist",
      });
    }

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
    if (!isValidVisitorId(req.params.visitorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid visitor id",
      });
    }

    const wishlist = await Wishlist.find({
      visitorId: req.params.visitorId,
    })
      .sort({ createdAt: -1 })
      .populate({
        path: "product",
        // the guest route needs no login at all -- without this every
        // product's purchase price and admin remarks were readable
        select: COST_FIELDS,
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

    // Must be a plain, reasonably-bounded string, not just a truthy
    // value — an object here (e.g. { "$gt": "" }) would otherwise be
    // passed straight into the Mongo queries below as a query operator
    // instead of a literal value, and an unbounded string could reach
    // the index key.
    if (!isValidVisitorId(visitorId)) {
      return res.status(400).json({
        success: false,
        message: "visitorId is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "A valid productId is required",
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

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const itemCount = await Wishlist.countDocuments({ visitorId });

    if (itemCount >= MAX_WISHLIST_ITEMS) {
      return res.status(400).json({
        success: false,
        message: `Wishlist is full (max ${MAX_WISHLIST_ITEMS} items) — remove something first`,
      });
    }

    const wishlistItem = await Wishlist.create({
      visitorId,
      product: productId,
      priceWhenAdded: product.price ?? null,
    });

    res.status(201).json({
      success: true,
      wishlistItem,
    });
  } catch (error) {
    // Same true-concurrency backstop as addToWishlist — see that
    // function's comment.
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Product already in wishlist",
      });
    }

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
    if (!isValidVisitorId(req.params.visitorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid visitor id",
      });
    }

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
    if (!isValidVisitorId(req.params.visitorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid visitor id",
      });
    }

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

    // Same guard as addToGuestWishlist.
    if (!isValidVisitorId(visitorId)) {
      return res.status(200).json({ success: true, merged: 0 });
    }

    const guestItems = await Wishlist.find({ visitorId });

    // One batched lookup instead of a per-item findOne — this login-flow
    // path only ever runs once per guest-with-wishlist-items login, so
    // the per-call cost was modest, but it's still an N+1 against a
    // frequently-hit auth path for no reason (the batched form is no
    // more complex).
    const ownedProductIds = new Set(
      (
        await Wishlist.find({
          user: req.user._id,
          product: { $in: guestItems.map((item) => item.product) },
        }).select("product")
      ).map((item) => item.product.toString()),
    );

    let merged = 0;

    for (const item of guestItems) {
      if (ownedProductIds.has(item.product.toString())) {
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

    // Pushes the "has the price actually dropped below whatever we last
    // alerted for" comparison into the DB via $lookup+$expr instead of
    // fetching the ENTIRE Wishlist collection (every item any user has
    // ever added, unbounded, every single run) into Node and filtering
    // in memory — that fetch grows with total historical wishlist
    // volume, not with how many alerts are actually due (N+1 audit,
    // 2026-10-13: not classic N+1, but the same "scales with the wrong
    // thing" cost problem).
    const eligible = await Wishlist.aggregate([
      { $match: { priceWhenAdded: { $ne: null } } },
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $match: {
          "user.email": { $exists: true, $nin: [null, ""] },
          $expr: {
            $lt: ["$product.price", { $ifNull: ["$lastAlertedPrice", "$priceWhenAdded"] }],
          },
        },
      },
      {
        $project: {
          lastAlertedPrice: 1,
          priceWhenAdded: 1,
          "user._id": 1,
          "user.name": 1,
          "user.email": 1,
          "product._id": 1,
          "product.name": 1,
          "product.slug": 1,
          "product.price": 1,
        },
      },
    ]);

    let sent = 0;

    for (const item of eligible) {
      const { user, product } = item;
      const alertBaseline = item.lastAlertedPrice ?? item.priceWhenAdded;

      const url = `${process.env.CLIENT_URL}/product/${product._id}${
        product.slug ? `/${product.slug}` : ""
      }`;

      // Atomic claim before sending — two overlapping cron fires (the
      // same "pingers like cron-job.org retry/double-fire" risk this
      // route's sibling cron endpoints already guard against) would
      // otherwise both run the aggregation above before either has
      // updated lastAlertedPrice, and both send this customer a
      // duplicate price-drop email for the same item (deep bug sweep,
      // 2026-10-13). Scoping the filter to lastAlertedPrice's value AT
      // AGGREGATION TIME (lastAlertedPrice has a schema default of null,
      // never "missing", so this comparison is always well-defined) means
      // a losing concurrent run's update simply matches nothing.
      const claimed = await Wishlist.findOneAndUpdate(
        { _id: item._id, lastAlertedPrice: item.lastAlertedPrice ?? null },
        { $set: { lastAlertedPrice: product.price } },
      );

      if (!claimed) continue;

      try {
        await sendEmail({
          to: user.email,
          subject: `Price drop: ${product.name} is now ₹${product.price}`,
          html: `
            <p>Hi ${escapeHtml(user.name || "there")},</p>
            <p>Good news — an item on your wishlist just got cheaper:</p>
            <p><strong>${escapeHtml(product.name)}</strong><br/>
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

        sent += 1;
      } catch (error) {
        console.error(`Price drop email failed for ${user.email}:`, error);
        // Release the claim so a genuine send failure (not a
        // concurrent-run race) still gets retried on the next run.
        await Wishlist.updateOne(
          { _id: item._id },
          { $set: { lastAlertedPrice: item.lastAlertedPrice ?? null } },
        );
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
