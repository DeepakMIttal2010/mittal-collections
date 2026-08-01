import Product from "../models/Product.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import ContactMessage from "../models/ContactMessage.js";
import PageVisit from "../models/PageVisit.js";
import Review from "../models/Review.js";
import Question from "../models/Question.js";

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

    const unseenReviews = await Review.find({ isSeenByAdmin: false })
      .populate("user", "name")
      .populate("product", "name")
      .sort({ createdAt: -1 })
      .limit(15);

    const unseenQuestions = await Question.find({ isSeenByAdmin: false })
      .populate("user", "name")
      .populate("product", "name")
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

    const reviewNotifications = unseenReviews.map((review) => ({
      id: review._id,
      type: "review",
      title: `New review from ${review.user?.name || "a customer"}`,
      subtitle: `${review.rating}★ on ${review.product?.name || "a product"}`,
      createdAt: review.createdAt,
      link: "/admin/reviews",
    }));

    const questionNotifications = unseenQuestions.map((question) => ({
      id: question._id,
      type: "question",
      title: `New question from ${question.user?.name || "a customer"}`,
      subtitle: `On ${question.product?.name || "a product"}`,
      createdAt: question.createdAt,
      link: "/admin/questions",
    }));

    const notifications = [
      ...orderNotifications,
      ...messageNotifications,
      ...reviewNotifications,
      ...questionNotifications,
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 15);

    res.status(200).json({
      success: true,
      notifications,
      unseenOrdersCount: unseenOrders.length,
      unreadMessagesCount: unreadMessages.length,
      unseenReviewsCount: unseenReviews.length,
      unseenQuestionsCount: unseenQuestions.length,
      totalUnread:
        unseenOrders.length +
        unreadMessages.length +
        unseenReviews.length +
        unseenQuestions.length,
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
    await Review.updateMany(
      { isSeenByAdmin: false },
      { isSeenByAdmin: true },
    );
    await Question.updateMany(
      { isSeenByAdmin: false },
      { isSeenByAdmin: true },
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

// ============================
// Get Reports Data (Admin)
// ============================

export const getReportsData = async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 7), 90);

    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    const revenueOrdersFilter = { orderStatus: { $ne: "Cancelled" } };

    const [
      totalOrders,
      totalCustomers,
      revenueAgg,
      salesOverTime,
      ordersByStatus,
      topProducts,
      revenueByCategory,
      totalVisits,
      uniqueVisitorsAgg,
      visitsOverTime,
      topPages,
      deviceBreakdown,
      visitorsInRangeAgg,
      visitorsBeforeRangeAgg,
    ] = await Promise.all([
      Order.countDocuments(),

      User.countDocuments({ role: "user" }),

      Order.aggregate([
        { $match: revenueOrdersFilter },
        { $group: { _id: null, total: { $sum: "$totalPrice" } } },
      ]),

      Order.aggregate([
        { $match: { ...revenueOrdersFilter, createdAt: { $gte: since } } },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            revenue: { $sum: "$totalPrice" },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      Order.aggregate([
        { $group: { _id: "$orderStatus", count: { $sum: 1 } } },
      ]),

      Order.aggregate([
        { $match: revenueOrdersFilter },
        { $unwind: "$orderItems" },
        {
          $group: {
            _id: "$orderItems.product",
            name: { $first: "$orderItems.name" },
            unitsSold: { $sum: "$orderItems.quantity" },
            revenue: {
              $sum: { $multiply: ["$orderItems.price", "$orderItems.quantity"] },
            },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
      ]),

      Order.aggregate([
        { $match: revenueOrdersFilter },
        { $unwind: "$orderItems" },
        {
          $lookup: {
            from: "products",
            localField: "orderItems.product",
            foreignField: "_id",
            as: "productInfo",
          },
        },
        { $unwind: "$productInfo" },
        {
          $group: {
            _id: "$productInfo.category",
            revenue: {
              $sum: {
                $multiply: ["$orderItems.price", "$orderItems.quantity"],
              },
            },
          },
        },
        {
          $lookup: {
            from: "categories",
            localField: "_id",
            foreignField: "_id",
            as: "categoryInfo",
          },
        },
        { $unwind: { path: "$categoryInfo", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            name: { $ifNull: ["$categoryInfo.name", "Uncategorized"] },
            revenue: 1,
          },
        },
        { $sort: { revenue: -1 } },
      ]),

      PageVisit.countDocuments(),

      PageVisit.aggregate([
        { $group: { _id: "$visitorId" } },
        { $count: "count" },
      ]),

      PageVisit.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            visits: { $sum: 1 },
            visitors: { $addToSet: "$visitorId" },
          },
        },
        {
          $project: {
            visits: 1,
            uniqueVisitors: { $size: "$visitors" },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      PageVisit.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: "$path", visits: { $sum: 1 } } },
        { $sort: { visits: -1 } },
        { $limit: 8 },
      ]),

      PageVisit.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: "$device", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      PageVisit.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: "$visitorId" } },
      ]),

      PageVisit.aggregate([
        { $match: { createdAt: { $lt: since } } },
        { $group: { _id: "$visitorId" } },
      ]),
    ]);

    const totalRevenue = revenueAgg[0]?.total || 0;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const visitorsBeforeRangeSet = new Set(
      visitorsBeforeRangeAgg.map((v) => v._id),
    );
    let newVisitors = 0;
    let returningVisitors = 0;

    visitorsInRangeAgg.forEach((v) => {
      if (visitorsBeforeRangeSet.has(v._id)) returningVisitors += 1;
      else newVisitors += 1;
    });

    const uniqueVisitors = uniqueVisitorsAgg[0]?.count || 0;

    res.status(200).json({
      success: true,
      summary: {
        totalRevenue,
        totalOrders,
        avgOrderValue,
        totalCustomers,
        totalVisits,
        uniqueVisitors,
        newVisitors,
        returningVisitors,
      },
      salesOverTime,
      ordersByStatus,
      visitsOverTime,
      topPages,
      deviceBreakdown,
      topProducts,
      revenueByCategory,
      rangeDays: days,
    });
  } catch (error) {
    console.error("Get Reports Data Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Get Visit Log (Admin — paginated, detailed)
// ============================

export const getVisitLog = async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 7), 90);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 25, 1);

    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    const filter = { createdAt: { $gte: since } };

    const [total, visits] = await Promise.all([
      PageVisit.countDocuments(filter),

      PageVisit.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select("path visitorId device country city createdAt"),
    ]);

    res.status(200).json({
      success: true,
      visits,
      total,
      page,
      limit,
      pages: Math.max(Math.ceil(total / limit), 1),
    });
  } catch (error) {
    console.error("Get Visit Log Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
