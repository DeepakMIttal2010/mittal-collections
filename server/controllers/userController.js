import User from "../models/User.js";
import Order from "../models/Order.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import Wishlist from "../models/Wishlist.js";
import CartSnapshot from "../models/CartSnapshot.js";
import PageVisit from "../models/PageVisit.js";
import Address from "../models/Address.js";
import Notification from "../models/Notification.js";
import Review from "../models/Review.js";
import Question from "../models/Question.js";
import Ticket from "../models/Ticket.js";
import ReturnRequest from "../models/ReturnRequest.js";
import { applyLoyaltyPointsChange } from "../utils/loyaltyPoints.js";
import { notifyUser } from "../utils/notify.js";
import { sendEmail } from "../config/mailer.js";

// How many of a customer's most recent page visits to show on their admin
// details page — enough to see a real browsing session, not their entire
// history.
const RECENT_VISITS_LIMIT = 30;

// ============================
// Get All Customers (Admin)
// ============================
export const getAllCustomers = async (req, res) => {
  try {
    const allowedSortFields = ["name", "email", "createdAt"];
    const sortBy = allowedSortFields.includes(req.query.sortBy)
      ? req.query.sortBy
      : "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    const customers = await User.find({ role: "user" })
      .select("-password")
      .sort({ [sortBy]: sortOrder });

    // One aggregate query for every customer's stats instead of a
    // per-customer Order.find() inside Promise.all -- that was a real
    // N+1 firing on every admin Customers page load (fetching every
    // FULL order document per customer just to sum totalPrice), found
    // in the 2026-09-26 Server/Infra audit. $group here computes the
    // same totalOrders/totalSpent server-side, in one round trip,
    // without ever pulling a full Order document into Node at all.
    const statsByUserId = new Map(
      (
        await Order.aggregate([
          {
            $group: {
              _id: "$user",
              totalOrders: { $sum: 1 },
              totalSpent: { $sum: { $ifNull: ["$totalPrice", 0] } },
            },
          },
        ])
      ).map((row) => [String(row._id), row]),
    );

    const customersWithStats = customers.map((customer) => {
      const stats = statsByUserId.get(String(customer._id));

      return {
        ...customer.toObject(),
        totalOrders: stats?.totalOrders || 0,
        totalSpent: stats?.totalSpent || 0,
      };
    });

    res.status(200).json({
      success: true,
      customers: customersWithStats,
    });
  } catch (error) {
    console.error("Get All Customers Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Get Single Customer with Orders (Admin)
// ============================
export const getCustomerById = async (req, res) => {
  try {
    const customer = await User.findById(req.params.id).select("-password");

    if (!customer || customer.role !== "user") {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const orders = await Order.find({ user: customer._id }).sort({
      createdAt: -1,
    });

    const totalSpent = orders.reduce(
      (sum, order) => sum + (order.totalPrice || 0),
      0,
    );

    const loyaltyTransactions = await LoyaltyTransaction.find({
      user: customer._id,
    }).sort({ createdAt: -1 });

    const [wishlistItems, cartSnapshot, recentVisits] = await Promise.all([
      Wishlist.find({ user: customer._id })
        .populate("product", "name image price")
        .sort({ createdAt: -1 }),

      CartSnapshot.findOne({ user: customer._id }),

      // Only visits recorded while this customer was logged in have a
      // user set — see PageVisit.js's comment. Anything from before that
      // tracking existed, or from a session where they weren't logged
      // in, won't appear here even if it really was them.
      PageVisit.find({ user: customer._id })
        .sort({ createdAt: -1 })
        .limit(RECENT_VISITS_LIMIT)
        .select("path device createdAt"),
    ]);

    res.status(200).json({
      success: true,
      customer,
      orders,
      totalOrders: orders.length,
      totalSpent,
      loyaltyTransactions,
      wishlistItems,
      cartItems: cartSnapshot?.items || [],
      recentVisits,
      viewedAnyProduct: recentVisits.some((v) => v.path.startsWith("/product/")),
    });
  } catch (error) {
    console.error("Get Customer Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Adjust Loyalty Points (Admin) — manual plus/minus, always logged
// ============================
export const adjustLoyaltyPoints = async (req, res) => {
  try {
    const { points, reason } = req.body;
    const pointsNum = Number(points);

    if (!Number.isInteger(pointsNum) || pointsNum === 0) {
      return res.status(400).json({
        success: false,
        message: "Points must be a non-zero whole number.",
      });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: "A reason is required for every manual adjustment.",
      });
    }

    const customer = await User.findById(req.params.id);

    if (!customer || customer.role !== "user") {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    if (pointsNum < 0 && customer.loyaltyPoints + pointsNum < 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot deduct ${Math.abs(pointsNum)} points — customer only has ${customer.loyaltyPoints}.`,
      });
    }

    const updatedCustomer = await applyLoyaltyPointsChange({
      userId: customer._id,
      type: "admin_adjustment",
      points: pointsNum,
      description: reason.trim(),
    });

    const transaction = await LoyaltyTransaction.findOne({
      user: customer._id,
    }).sort({ createdAt: -1 });

    notifyUser({
      userId: customer._id,
      type: "loyalty_points",
      title:
        pointsNum > 0
          ? "Loyalty points added to your account"
          : "Loyalty points adjusted",
      message: `${pointsNum > 0 ? "+" : ""}${pointsNum} points — ${reason.trim()}`,
      link: "/account",
    });

    res.status(200).json({
      success: true,
      message: "Loyalty points updated.",
      loyaltyPoints: updatedCustomer.loyaltyPoints,
      transaction,
    });
  } catch (error) {
    console.error("Adjust Loyalty Points Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Block / Unblock Customer (Admin)
// ============================
export const toggleBlockCustomer = async (req, res) => {
  try {
    const customer = await User.findById(req.params.id);

    if (!customer || customer.role !== "user") {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    customer.isBlocked = !customer.isBlocked;

    await customer.save();

    // A blocked customer can't log in at all (see authController.js's
    // own isBlocked check on login) — email is the only channel that
    // can actually reach them; the in-app notification only matters
    // once they're unblocked again.
    const statusMessage = customer.isBlocked
      ? {
          subject: "Your Mittal Collections account has been blocked",
          body: "Your account has been blocked. If you believe this is a mistake, please contact support.",
        }
      : {
          subject: "Your Mittal Collections account has been unblocked",
          body: "Your account has been unblocked — you can log in again.",
        };

    try {
      await sendEmail({
        to: customer.email,
        bcc: process.env.ADMIN_NOTIFICATION_EMAIL,
        subject: statusMessage.subject,
        html: `
          <p>Hi ${customer.name || "there"},</p>
          <p>${statusMessage.body}</p>
        `,
      });
    } catch (error) {
      console.error("Toggle Block Customer Email Error:", error);
    }

    notifyUser({
      userId: customer._id,
      type: "account_status",
      title: statusMessage.subject,
      message: statusMessage.body,
      link: "/account",
    });

    res.status(200).json({
      success: true,
      message: customer.isBlocked
        ? "Customer blocked successfully"
        : "Customer unblocked successfully",
      isBlocked: customer.isBlocked,
    });
  } catch (error) {
    console.error("Toggle Block Customer Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Delete Customer (Admin)
// ============================
export const deleteCustomer = async (req, res) => {
  try {
    const customer = await User.findById(req.params.id);

    if (!customer || customer.role !== "user") {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Order history is a real business/financial record (and every other
    // admin list that shows orders populates `user` for a name/email) —
    // deleting a customer who has any would leave those orders pointing
    // at a dangling user reference forever. toggleBlockCustomer already
    // exists as the reversible alternative for "stop this customer from
    // using the account" without destroying that history.
    const hasOrders = await Order.exists({ user: customer._id });

    if (hasOrders) {
      return res.status(400).json({
        success: false,
        message:
          "This customer has order history and can't be deleted — block them instead to prevent further activity.",
      });
    }

    // No orders means none of this customer's other data has any
    // standalone record-keeping value either — clean it up alongside the
    // account instead of leaving it as dangling references (the same
    // class of gap already closed for product deletion, which cleans up
    // orphaned Questions in permanentlyDeleteProduct).
    await Promise.all([
      Address.deleteMany({ user: customer._id }),
      Wishlist.deleteMany({ user: customer._id }),
      CartSnapshot.deleteOne({ user: customer._id }),
      Notification.deleteMany({ user: customer._id }),
      Review.deleteMany({ user: customer._id }),
      Question.deleteMany({ user: customer._id }),
      Ticket.deleteMany({ user: customer._id }),
      ReturnRequest.deleteMany({ user: customer._id }),
      LoyaltyTransaction.deleteMany({ user: customer._id }),
      PageVisit.updateMany({ user: customer._id }, { $set: { user: null } }),
    ]);

    await customer.deleteOne();

    res.status(200).json({
      success: true,
      message: "Customer deleted successfully",
    });
  } catch (error) {
    console.error("Delete Customer Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
