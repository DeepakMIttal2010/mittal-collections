import Notification from "../models/Notification.js";

// ============================
// Get My Notifications (Customer)
// ============================

export const getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30);

    const unreadCount = await Notification.countDocuments({
      user: req.user._id,
      isRead: false,
    });

    res.status(200).json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error("Get My Notifications Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Mark Single Notification Read (Customer)
// ============================

export const markNotificationRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isRead: true },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.status(200).json({
      success: true,
      notification,
    });
  } catch (error) {
    console.error("Mark Notification Read Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Mark All Notifications Read (Customer)
// ============================

export const markAllNotificationsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, isRead: false },
      { isRead: true },
    );

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
