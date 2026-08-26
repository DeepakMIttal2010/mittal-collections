import User from "../models/User.js";
import Order from "../models/Order.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import Wishlist from "../models/Wishlist.js";
import CartSnapshot from "../models/CartSnapshot.js";
import PageVisit from "../models/PageVisit.js";
import { applyLoyaltyPointsChange } from "../utils/loyaltyPoints.js";
import { notifyUser } from "../utils/notify.js";

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

    // Har customer ke liye order count aur total spent nikalo
    const customersWithStats = await Promise.all(
      customers.map(async (customer) => {
        const orders = await Order.find({ user: customer._id });

        const totalOrders = orders.length;

        const totalSpent = orders.reduce(
          (sum, order) => sum + (order.totalPrice || 0),
          0,
        );

        return {
          ...customer.toObject(),
          totalOrders,
          totalSpent,
        };
      }),
    );

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
