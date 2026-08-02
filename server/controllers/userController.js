import User from "../models/User.js";
import Order from "../models/Order.js";

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

    res.status(200).json({
      success: true,
      customer,
      orders,
      totalOrders: orders.length,
      totalSpent,
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
