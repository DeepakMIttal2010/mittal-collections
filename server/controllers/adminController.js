import Product from "../models/Product.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import ContactMessage from "../models/ContactMessage.js";
import PageVisit from "../models/PageVisit.js";
import Review from "../models/Review.js";
import Question from "../models/Question.js";

// ISO 3166-2:IN state/UT codes, for readable display in the location report
const INDIAN_STATE_NAMES = {
  AN: "Andaman and Nicobar Islands",
  AP: "Andhra Pradesh",
  AR: "Arunachal Pradesh",
  AS: "Assam",
  BR: "Bihar",
  CH: "Chandigarh",
  CT: "Chhattisgarh",
  DN: "Dadra and Nagar Haveli",
  DD: "Daman and Diu",
  DL: "Delhi",
  GA: "Goa",
  GJ: "Gujarat",
  HR: "Haryana",
  HP: "Himachal Pradesh",
  JK: "Jammu and Kashmir",
  JH: "Jharkhand",
  KA: "Karnataka",
  KL: "Kerala",
  LD: "Lakshadweep",
  MP: "Madhya Pradesh",
  MH: "Maharashtra",
  MN: "Manipur",
  ML: "Meghalaya",
  MZ: "Mizoram",
  NL: "Nagaland",
  OR: "Odisha",
  PY: "Puducherry",
  PB: "Punjab",
  RJ: "Rajasthan",
  SK: "Sikkim",
  TN: "Tamil Nadu",
  TG: "Telangana",
  TR: "Tripura",
  UP: "Uttar Pradesh",
  UT: "Uttarakhand",
  WB: "West Bengal",
};

const formatRegion = (country, region) =>
  country === "IN" && INDIAN_STATE_NAMES[region]
    ? INDIAN_STATE_NAMES[region]
    : region;

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
    // Either an explicit ?startDate=&endDate= (YYYY-MM-DD) custom range,
    // or the older ?days= preset — custom range wins if both are given.
    let since;
    let until;
    let days;

    if (req.query.startDate && req.query.endDate) {
      since = new Date(req.query.startDate);
      since.setHours(0, 0, 0, 0);

      until = new Date(req.query.endDate);
      until.setHours(23, 59, 59, 999);

      days = Math.max(
        Math.round((until - since) / (1000 * 60 * 60 * 24)) + 1,
        1,
      );
    } else {
      days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 7), 90);

      since = new Date();
      since.setDate(since.getDate() - (days - 1));
      since.setHours(0, 0, 0, 0);

      until = new Date();
      until.setHours(23, 59, 59, 999);
    }

    const dateRange = { $gte: since, $lte: until };

    // Previous period of equal length immediately before `since`, used
    // to compute growth % against the currently selected range.
    const prevUntil = new Date(since.getTime() - 1);
    const prevSince = new Date(since);
    prevSince.setDate(prevSince.getDate() - days);
    const prevDateRange = { $gte: prevSince, $lte: prevUntil };

    // Orders that count toward revenue — excludes Cancelled, always
    // scoped to whichever range is being asked about.
    const revenueOrdersFilter = { orderStatus: { $ne: "Cancelled" } };
    const revenueOrdersInRange = {
      ...revenueOrdersFilter,
      createdAt: dateRange,
    };

    const [
      totalOrders,
      totalCustomers,
      revenueAgg,
      prevRevenueAgg,
      prevOrdersCount,
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
      locationBreakdownAgg,
      productViewersAgg,
      cartViewersAgg,
      checkoutViewersAgg,
    ] = await Promise.all([
      Order.countDocuments({ createdAt: dateRange }),

      User.countDocuments({ role: "user" }),

      Order.aggregate([
        { $match: revenueOrdersInRange },
        { $group: { _id: null, total: { $sum: "$totalPrice" } } },
      ]),

      Order.aggregate([
        {
          $match: { ...revenueOrdersFilter, createdAt: prevDateRange },
        },
        { $group: { _id: null, total: { $sum: "$totalPrice" } } },
      ]),

      Order.countDocuments({ createdAt: prevDateRange }),

      Order.aggregate([
        { $match: revenueOrdersInRange },
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
        { $match: { createdAt: dateRange } },
        { $group: { _id: "$orderStatus", count: { $sum: 1 } } },
      ]),

      Order.aggregate([
        { $match: revenueOrdersInRange },
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
        { $match: revenueOrdersInRange },
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

      PageVisit.countDocuments({ createdAt: dateRange }),

      PageVisit.aggregate([
        { $match: { createdAt: dateRange } },
        { $group: { _id: "$visitorId" } },
        { $count: "count" },
      ]),

      PageVisit.aggregate([
        { $match: { createdAt: dateRange } },
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
        { $match: { createdAt: dateRange } },
        { $group: { _id: "$path", visits: { $sum: 1 } } },
        { $sort: { visits: -1 } },
        { $limit: 8 },
      ]),

      PageVisit.aggregate([
        { $match: { createdAt: dateRange } },
        { $group: { _id: "$device", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      PageVisit.aggregate([
        { $match: { createdAt: dateRange } },
        { $group: { _id: "$visitorId" } },
      ]),

      PageVisit.aggregate([
        { $match: { createdAt: { $lt: since } } },
        { $group: { _id: "$visitorId" } },
      ]),

      PageVisit.aggregate([
        { $match: { createdAt: dateRange } },
        {
          $group: {
            _id: { country: "$country", region: "$region", city: "$city" },
            visits: { $sum: 1 },
            visitors: { $addToSet: "$visitorId" },
          },
        },
        {
          $project: {
            _id: 0,
            country: "$_id.country",
            region: "$_id.region",
            city: "$_id.city",
            visits: 1,
            uniqueVisitors: { $size: "$visitors" },
          },
        },
        { $sort: { visits: -1 } },
        { $limit: 20 },
      ]),

      // Approximate conversion funnel — based on distinct visitors who
      // reached each page, not exact session-to-order stitching (visits
      // are tracked by an anonymous visitorId, not linked to a user
      // account, so this can't be joined precisely to Orders).
      PageVisit.aggregate([
        { $match: { createdAt: dateRange, path: /^\/product\// } },
        { $group: { _id: "$visitorId" } },
        { $count: "count" },
      ]),

      PageVisit.aggregate([
        { $match: { createdAt: dateRange, path: "/cart" } },
        { $group: { _id: "$visitorId" } },
        { $count: "count" },
      ]),

      PageVisit.aggregate([
        { $match: { createdAt: dateRange, path: "/checkout" } },
        { $group: { _id: "$visitorId" } },
        { $count: "count" },
      ]),
    ]);

    const totalRevenue = revenueAgg[0]?.total || 0;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const prevRevenue = prevRevenueAgg[0]?.total || 0;

    // null growth (rather than 0% or +Infinity) when the previous period
    // had nothing to compare against — the UI shows "—" in that case.
    const growthPercent = (current, previous) => {
      if (previous === 0) return current > 0 ? null : 0;
      return ((current - previous) / previous) * 100;
    };

    const growth = {
      revenue: growthPercent(totalRevenue, prevRevenue),
      orders: growthPercent(totalOrders, prevOrdersCount),
    };

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

    const locationBreakdown = locationBreakdownAgg.map((entry) => ({
      country: entry.country || "Unknown",
      region: entry.region
        ? formatRegion(entry.country, entry.region)
        : "Unknown",
      city: entry.city || "Unknown",
      visits: entry.visits,
      uniqueVisitors: entry.uniqueVisitors,
    }));

    const funnel = {
      visitors: uniqueVisitors,
      productViewers: productViewersAgg[0]?.count || 0,
      cartViewers: cartViewersAgg[0]?.count || 0,
      checkoutViewers: checkoutViewersAgg[0]?.count || 0,
      ordersPlaced: totalOrders,
    };

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
      growth,
      funnel,
      salesOverTime,
      ordersByStatus,
      visitsOverTime,
      topPages,
      deviceBreakdown,
      topProducts,
      revenueByCategory,
      locationBreakdown,
      rangeDays: days,
      range: { since, until },
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
