import Product from "../models/Product.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import ContactMessage from "../models/ContactMessage.js";
import PageVisit from "../models/PageVisit.js";
import Review from "../models/Review.js";
import Question from "../models/Question.js";
import SearchLog from "../models/SearchLog.js";
import CartSnapshot from "../models/CartSnapshot.js";
import Wishlist from "../models/Wishlist.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import Ticket from "../models/Ticket.js";
import ReturnRequest from "../models/ReturnRequest.js";

// Matches the customer-facing "Only X left in stock!" threshold in
// client/src/utils/stock.js — kept in sync manually since one lives on
// each side of the API boundary.
const LOW_STOCK_THRESHOLD = 5;

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

    const salesAgg = await Order.aggregate([
      // A cancelled order never earned any money — matches the same
      // exclusion already used for the Reports page's revenue figure
      // (see revenueOrdersFilter below), just not previously applied here.
      { $match: { orderStatus: { $ne: "Cancelled" } } },
      { $group: { _id: null, totalSales: { $sum: "$totalPrice" } } },
    ]);

    const totalSales = salesAgg[0]?.totalSales || 0;

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

    const unseenTickets = await Ticket.find({ isSeenByAdmin: false })
      .populate("user", "name")
      .sort({ lastMessageAt: -1 })
      .limit(15);

    const unseenReturns = await ReturnRequest.find({ isSeenByAdmin: false })
      .populate("user", "name")
      .sort({ createdAt: -1 })
      .limit(15);

    // Low stock is a live gauge, not a discrete "new" event — there's no
    // isSeenByAdmin to clear, it just stops appearing once restocked.
    // Products with their own restockAlertEnabled/Quantity use that
    // instead of the site-wide default threshold.
    const lowStockCount = await Product.countDocuments({
      stock: { $gt: 0 },
      $or: [
        {
          restockAlertEnabled: true,
          $expr: { $lte: ["$stock", "$restockAlertQuantity"] },
        },
        {
          restockAlertEnabled: { $ne: true },
          stock: { $lte: LOW_STOCK_THRESHOLD },
        },
      ],
    });
    const outOfStockCount = await Product.countDocuments({ stock: 0 });

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

    const ticketNotifications = unseenTickets.map((ticket) => ({
      id: ticket._id,
      type: "ticket",
      title: `New support message from ${ticket.user?.name || "a customer"}`,
      subtitle: ticket.subject,
      createdAt: ticket.lastMessageAt,
      link: `/admin/tickets/${ticket._id}`,
    }));

    const returnNotifications = unseenReturns.map((returnRequest) => ({
      id: returnRequest._id,
      type: "return",
      title: `New return request from ${returnRequest.user?.name || "a customer"}`,
      subtitle: returnRequest.productName,
      createdAt: returnRequest.createdAt,
      link: "/admin/returns",
    }));

    const stockNotifications = [];
    if (outOfStockCount > 0 || lowStockCount > 0) {
      const parts = [];
      if (outOfStockCount > 0) parts.push(`${outOfStockCount} out of stock`);
      if (lowStockCount > 0) parts.push(`${lowStockCount} running low`);

      stockNotifications.push({
        id: "stock-alert",
        type: "stock",
        title: "Products need restocking",
        subtitle: parts.join(" · "),
        createdAt: new Date(),
        link: "/admin/products",
      });
    }

    const notifications = [
      ...orderNotifications,
      ...messageNotifications,
      ...reviewNotifications,
      ...questionNotifications,
      ...ticketNotifications,
      ...returnNotifications,
      ...stockNotifications,
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20);

    res.status(200).json({
      success: true,
      notifications,
      unseenOrdersCount: unseenOrders.length,
      unreadMessagesCount: unreadMessages.length,
      unseenReviewsCount: unseenReviews.length,
      unseenQuestionsCount: unseenQuestions.length,
      unseenTicketsCount: unseenTickets.length,
      unseenReturnsCount: unseenReturns.length,
      lowStockCount,
      outOfStockCount,
      totalUnread:
        unseenOrders.length +
        unreadMessages.length +
        unseenReviews.length +
        unseenQuestions.length +
        unseenTickets.length +
        unseenReturns.length +
        stockNotifications.length,
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
    await Ticket.updateMany(
      { isSeenByAdmin: false },
      { isSeenByAdmin: true },
    );
    await ReturnRequest.updateMany(
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
      topSearchesAgg,
      zeroResultSearchesAgg,
      totalSearches,
      pointsEarnedAgg,
      pointsRedeemedAgg,
      pointsExpiredAgg,
      referralSignups,
      referralConversions,
      referralPointsPaidAgg,
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

      SearchLog.aggregate([
        { $match: { createdAt: dateRange } },
        {
          $group: {
            _id: "$query",
            count: { $sum: 1 },
            avgResults: { $avg: "$resultCount" },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      SearchLog.aggregate([
        { $match: { createdAt: dateRange, resultCount: 0 } },
        { $group: { _id: "$query", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      SearchLog.countDocuments({ createdAt: dateRange }),

      // Net of clawback — a delivered order's points that get reversed
      // when it's later cancelled (see updateOrderStatus) shouldn't stay
      // counted as "earned"; clawback's points are already stored
      // negative, so summing it alongside nets it out correctly.
      LoyaltyTransaction.aggregate([
        {
          $match: {
            type: { $in: ["earned", "referral_bonus", "clawback"] },
            createdAt: dateRange,
          },
        },
        { $group: { _id: null, total: { $sum: "$points" } } },
      ]),

      LoyaltyTransaction.aggregate([
        { $match: { type: "redeemed", createdAt: dateRange } },
        { $group: { _id: null, total: { $sum: "$points" } } },
      ]),

      LoyaltyTransaction.aggregate([
        { $match: { type: "expired", createdAt: dateRange } },
        { $group: { _id: null, total: { $sum: "$points" } } },
      ]),

      // Referral signups: new accounts created in range that were
      // referred by someone (conversion — i.e. their first order,
      // which is when the bonus fires — may land in a different range).
      User.countDocuments({ referredBy: { $ne: null }, createdAt: dateRange }),

      // Referral conversions: referred users whose bonus actually paid
      // out in this range. "Referral signup bonus" is the description
      // used only on the referred side, so this can't double-count.
      LoyaltyTransaction.countDocuments({
        type: "referral_bonus",
        description: "Referral signup bonus",
        createdAt: dateRange,
      }),

      LoyaltyTransaction.aggregate([
        { $match: { type: "referral_bonus", createdAt: dateRange } },
        { $group: { _id: null, total: { $sum: "$points" } } },
      ]),
    ]);

    // Cart abandonment is a current-state snapshot, not a date-range
    // metric — a CartSnapshot row is deleted the moment its cart turns
    // into an order, so there's no historical trail to scope by date.
    // "Abandoned" matches the same 3-hour cutoff the reminder job uses.
    const ABANDON_CUTOFF_HOURS = 3;
    const abandonCutoff = new Date(
      Date.now() - ABANDON_CUTOFF_HOURS * 60 * 60 * 1000,
    );

    const abandonedCarts = await CartSnapshot.find({
      updatedAt: { $lte: abandonCutoff },
    });

    const cartAbandonment = {
      abandonedCount: abandonedCarts.length,
      abandonedValue: abandonedCarts.reduce(
        (sum, cart) =>
          sum +
          cart.items.reduce(
            (itemSum, item) => itemSum + item.price * item.quantity,
            0,
          ),
        0,
      ),
      reminderSentAwaitingRecovery: abandonedCarts.filter(
        (cart) => cart.reminderSentAt,
      ).length,
    };

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

    const topSearches = topSearchesAgg.map((s) => ({
      query: s._id,
      count: s.count,
      avgResults: Math.round(s.avgResults * 10) / 10,
    }));

    const zeroResultSearches = zeroResultSearchesAgg.map((s) => ({
      query: s._id,
      count: s.count,
    }));

    const pointsEarned = pointsEarnedAgg[0]?.total || 0;
    const pointsRedeemed = Math.abs(pointsRedeemedAgg[0]?.total || 0);
    const pointsExpired = Math.abs(pointsExpiredAgg[0]?.total || 0);
    const referralPointsPaid = referralPointsPaidAgg[0]?.total || 0;

    const loyalty = {
      pointsEarned,
      pointsRedeemed,
      pointsExpired,
      // % of points earned in this range that have also been redeemed in
      // this range — a rough signal, not a precise cohort redemption rate
      // (points earned now can be redeemed in a later period, and vice
      // versa).
      redemptionRate: pointsEarned > 0 ? (pointsRedeemed / pointsEarned) * 100 : null,
      referralSignups,
      referralConversions,
      referralPointsPaid,
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
      cartAbandonment,
      search: {
        totalSearches,
        topSearches,
        zeroResultSearches,
      },
      loyalty,
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

// ============================
// Get Product Engagement — per-product view count (all-time, unique
// visitors), current wishlist count, and current in-cart count. All three
// are live/current-state numbers, not a historical "ever happened" tally —
// e.g. cartCount drops back to 0 once a customer empties their cart, it
// doesn't keep counting past adds. cartCount only covers logged-in users:
// CartSnapshot is a server-side mirror kept solely for abandoned-cart
// detection (see its own file comment), synced only while logged in — a
// guest's cart, which never syncs, isn't reflected here.
// ============================
export const getProductEngagement = async (req, res) => {
  try {
    const [products, viewsAgg, wishlistAgg, cartAgg] = await Promise.all([
      Product.find().select("name image price stock").lean(),

      // path is "/product/:id" or "/product/:id/:slug" — split on "/" to
      // pull the id out (index 2: "", "product", id, [slug]) rather than
      // grouping by the raw path, which would fragment counts across a
      // product's old and current slug after a rename.
      PageVisit.aggregate([
        { $match: { path: /^\/product\// } },
        {
          $project: {
            productId: { $arrayElemAt: [{ $split: ["$path", "/"] }, 2] },
            visitorId: 1,
          },
        },
        {
          $group: {
            _id: "$productId",
            views: { $sum: 1 },
            uniqueVisitors: { $addToSet: "$visitorId" },
          },
        },
        { $project: { views: 1, uniqueViewers: { $size: "$uniqueVisitors" } } },
      ]),

      Wishlist.aggregate([{ $group: { _id: "$product", count: { $sum: 1 } } }]),

      CartSnapshot.aggregate([
        { $unwind: "$items" },
        { $group: { _id: "$items.product", count: { $sum: 1 } } },
      ]),
    ]);

    const viewsMap = new Map(viewsAgg.map((v) => [String(v._id), v]));
    const wishlistMap = new Map(wishlistAgg.map((w) => [String(w._id), w.count]));
    const cartMap = new Map(cartAgg.map((c) => [String(c._id), c.count]));

    const engagement = products
      .map((p) => {
        const idStr = String(p._id);
        const viewData = viewsMap.get(idStr);

        return {
          productId: p._id,
          name: p.name,
          image: p.image,
          views: viewData?.views || 0,
          uniqueViewers: viewData?.uniqueViewers || 0,
          wishlistCount: wishlistMap.get(idStr) || 0,
          cartCount: cartMap.get(idStr) || 0,
        };
      })
      .sort((a, b) => b.views - a.views);

    res.status(200).json({
      success: true,
      engagement,
    });
  } catch (error) {
    console.error("Get Product Engagement Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Who has a given product wishlisted right now — name/email/mobile +
// exactly when (Wishlist is one doc per user+product, created once and
// deleted on remove, so this date is precise).
// ============================
export const getProductWishlistUsers = async (req, res) => {
  try {
    const items = await Wishlist.find({ product: req.params.productId })
      .populate("user", "name email mobile")
      .sort({ createdAt: -1 });

    // Guest wishlist items (no account, tracked by anonymous visitorId —
    // see Wishlist.js) are kept rather than dropped, same as
    // getProductCartUsers below, so this count always matches
    // getProductEngagement's wishlistCount.
    const users = items.map((item) => ({
      name: item.user?.name || "Guest (not logged in)",
      email: item.user?.email || null,
      mobile: item.user?.mobile || null,
      addedAt: item.createdAt,
    }));

    res.status(200).json({ success: true, users });
  } catch (error) {
    console.error("Get Product Wishlist Users Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Who currently has a given product in their cart — name/email/mobile +
// when their cart was last synced with this item present. Not a precise
// "added on" date: CartSnapshot has one updatedAt per user's whole cart,
// not per line item, so this reflects the most recent sync that included
// this product, which could be later than when it was first added if the
// cart was touched again since.
// ============================
export const getProductCartUsers = async (req, res) => {
  try {
    const snapshots = await CartSnapshot.find({
      "items.product": req.params.productId,
    })
      .populate("user", "name email mobile")
      .sort({ updatedAt: -1 });

    // Guest snapshots (no account, tracked by anonymous visitorId — see
    // CartSnapshot.js) are kept in the list rather than dropped, so the
    // count here always matches getProductEngagement's cartCount. They
    // just have no contact details to show, since there's no account.
    const users = snapshots.map((snapshot) => ({
      name: snapshot.user?.name || "Guest (not logged in)",
      email: snapshot.user?.email || null,
      mobile: snapshot.user?.mobile || null,
      lastSyncedAt: snapshot.updatedAt,
    }));

    res.status(200).json({ success: true, users });
  } catch (error) {
    console.error("Get Product Cart Users Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Who viewed a given product — logged-in viewers only. Most traffic is
// anonymous (PageVisit.user is only ever set for a visit made while
// logged in — see PageVisit.js), so this list is expected to be far
// shorter than getProductEngagement's own views/uniqueViewers count;
// the frontend surfaces that gap explicitly rather than implying this
// is the complete viewer list.
// ============================
export const getProductViewUsers = async (req, res) => {
  try {
    const visits = await PageVisit.aggregate([
      {
        $match: {
          path: new RegExp(`^/product/${req.params.productId}(/|$)`),
          user: { $ne: null },
        },
      },
      { $group: { _id: "$user", lastViewedAt: { $max: "$createdAt" } } },
      { $sort: { lastViewedAt: -1 } },
    ]);

    const accounts = await User.find({
      _id: { $in: visits.map((v) => v._id) },
    }).select("name email mobile");
    const accountMap = new Map(accounts.map((a) => [a._id.toString(), a]));

    const users = visits.map((v) => {
      const account = accountMap.get(v._id.toString());
      return {
        name: account?.name || "Deleted account",
        email: account?.email || null,
        mobile: account?.mobile || null,
        lastViewedAt: v.lastViewedAt,
      };
    });

    res.status(200).json({ success: true, users });
  } catch (error) {
    console.error("Get Product View Users Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Every wishlist/cart row across every product, flattened for the main
// Reports CSV export — the per-product drill-down modals only ever load
// one product's list at a time, so the export needed its own query
// rather than reusing state already in the browser.
// ============================
export const getEngagementDetails = async (req, res) => {
  try {
    const [wishlistItems, cartSnapshots] = await Promise.all([
      Wishlist.find()
        .populate("user", "name email mobile")
        .populate("product", "name"),
      CartSnapshot.find().populate("user", "name email mobile"),
    ]);

    const rows = [];

    wishlistItems.forEach((item) => {
      rows.push({
        product: item.product?.name || "Deleted product",
        type: "Wishlist",
        name: item.user?.name || "Guest (not logged in)",
        mobile: item.user?.mobile || "",
        email: item.user?.email || "",
        date: item.createdAt,
      });
    });

    cartSnapshots.forEach((snapshot) => {
      snapshot.items.forEach((cartItem) => {
        rows.push({
          product: cartItem.name,
          type: "In Cart",
          name: snapshot.user?.name || "Guest (not logged in)",
          mobile: snapshot.user?.mobile || "",
          email: snapshot.user?.email || "",
          date: snapshot.updatedAt,
        });
      });
    });

    res.status(200).json({ success: true, rows });
  } catch (error) {
    console.error("Get Engagement Details Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
