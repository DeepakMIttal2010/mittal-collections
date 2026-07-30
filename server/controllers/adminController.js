import Product from "../models/Product.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import ContactMessage from "../models/ContactMessage.js";

export const getDashboardData = async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();

    const totalOrders = await Order.countDocuments();

    const totalUsers = await User.countDocuments();

    const orders = await Order.find();

    let totalSales = 0;

    orders.forEach((order) => {
      totalSales += order.totalPrice || 0;
    });

    const recentOrders = await Order.find()
      .populate("user", "name")
      .sort({ createdAt: -1 })
      .limit(5);

    const recentProducts = await Product.find()
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      success: true,
      data: {
        totalProducts,
        totalOrders,
        totalUsers,
        totalSales,
        recentOrders,
        recentProducts,
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Get Notifications (Admin)
// ============================

export const getNotifications = async (req, res) => {
  try {
    const unseenOrders = await Order.find({ isSeenByAdmin: false })
      .populate("user", "name")
      .sort({ createdAt: -1 })
      .limit(15);

    const unreadMessages = await ContactMessage.find({ isRead: false })
      .sort({ createdAt: -1 })
      .limit(15);

    const orderNotifications = unseenOrders.map((order) => ({
      id: order._id,
      type: "order",
      title: `New order from ${order.user?.name || "a customer"}`,
      subtitle: `₹${order.totalPrice} · ${order.orderStatus}`,
      createdAt: order.createdAt,
      link: "/admin/orders",
    }));

    const messageNotifications = unreadMessages.map((message) => ({
      id: message._id,
      type: "message",
      title: `New message from ${message.name}`,
      subtitle: message.subject,
      createdAt: message.createdAt,
      link: "/admin/messages",
    }));

    const notifications = [...orderNotifications, ...messageNotifications]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 15);

    res.status(200).json({
      success: true,
      notifications,
      unseenOrdersCount: unseenOrders.length,
      unreadMessagesCount: unreadMessages.length,
      totalUnread: unseenOrders.length + unreadMessages.length,
    });
  } catch (error) {
    console.error("Get Notifications Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Mark All Notifications Read (Admin)
// ============================

export const markAllNotificationsRead = async (req, res) => {
  try {
    await Order.updateMany(
      { isSeenByAdmin: false },
      { isSeenByAdmin: true },
    );

    await ContactMessage.updateMany({ isRead: false }, { isRead: true });

    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("Mark All Notifications Read Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
