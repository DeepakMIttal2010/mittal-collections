import ReturnRequest from "../models/ReturnRequest.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import SiteSettings from "../models/SiteSettings.js";
import { sendEmail } from "../config/mailer.js";

const notifyAdmin = async (returnRequest) => {
  try {
    const settings = await SiteSettings.findOne();

    if (!settings?.email) return;

    await sendEmail({
      to: settings.email,
      subject: `New return request: ${returnRequest.productName}`,
      html: `
        <p>A customer requested a return.</p>
        <p><strong>Product:</strong> ${returnRequest.productName} (Qty: ${returnRequest.quantity})</p>
        <p><strong>Reason:</strong> ${returnRequest.reason}</p>
        <p><a href="${process.env.CLIENT_URL}/admin/returns">View in admin panel</a></p>
      `,
    });
  } catch (error) {
    console.error("Notify Admin (Return) Error:", error);
  }
};

const notifyCustomer = async (returnRequest, customerEmail) => {
  try {
    await sendEmail({
      to: customerEmail,
      subject: `Your return request is now "${returnRequest.status}"`,
      html: `
        <p>Hi,</p>
        <p>Your return request for <strong>${returnRequest.productName}</strong> is now:
          <strong>${returnRequest.status}</strong>
        </p>
        ${returnRequest.adminNote ? `<p>Note from our team: ${returnRequest.adminNote}</p>` : ""}
        <p><a href="${process.env.CLIENT_URL}/returns">View your returns</a></p>
      `,
    });
  } catch (error) {
    console.error("Notify Customer (Return) Error:", error);
  }
};

// ============================
// CREATE RETURN REQUEST (Customer)
// ============================
export const createReturnRequest = async (req, res) => {
  try {
    const { orderId, productId, quantity, reason } = req.body;

    if (!orderId || !productId || !reason?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Order, product and reason are required",
      });
    }

    const order = await Order.findById(orderId);

    if (!order || order.user.toString() !== req.user._id.toString()) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.orderStatus !== "Delivered") {
      return res.status(400).json({
        success: false,
        message: "Only delivered orders can be returned",
      });
    }

    const orderItem = order.orderItems.find(
      (item) => item.product.toString() === productId,
    );

    if (!orderItem) {
      return res.status(404).json({
        success: false,
        message: "This product is not part of that order",
      });
    }

    const requestedQty = Math.min(
      Math.max(parseInt(quantity, 10) || 1, 1),
      orderItem.quantity,
    );

    const existing = await ReturnRequest.findOne({
      order: orderId,
      product: productId,
      status: { $ne: "Rejected" },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "A return request already exists for this item",
      });
    }

    const product = await Product.findById(productId);

    if (!product || !product.isReturnable) {
      return res.status(400).json({
        success: false,
        message: "This product is not eligible for return",
      });
    }

    const settings = await SiteSettings.findOne();
    const periodDays =
      product.returnPeriodDays || settings?.defaultReturnPeriodDays || 7;

    if (!order.deliveredAt) {
      return res.status(400).json({
        success: false,
        message: "This order has no delivery date on record",
      });
    }

    const deadline = new Date(order.deliveredAt);
    deadline.setDate(deadline.getDate() + periodDays);

    if (new Date() > deadline) {
      return res.status(400).json({
        success: false,
        message: "The return window for this item has closed",
      });
    }

    const returnRequest = await ReturnRequest.create({
      order: orderId,
      user: req.user._id,
      product: productId,
      productName: orderItem.name,
      productImage: orderItem.image,
      quantity: requestedQty,
      reason: reason.trim(),
    });

    notifyAdmin(returnRequest).catch(() => {});

    res.status(201).json({
      success: true,
      returnRequest,
    });
  } catch (error) {
    console.error("Create Return Request Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// GET MY RETURN REQUESTS (Customer)
// ============================
export const getMyReturnRequests = async (req, res) => {
  try {
    const returns = await ReturnRequest.find({ user: req.user._id }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      returns,
    });
  } catch (error) {
    console.error("Get My Return Requests Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// GET ALL RETURN REQUESTS (Admin)
// ============================
export const getAllReturnRequestsAdmin = async (req, res) => {
  try {
    const filter = {};

    if (req.query.status) filter.status = req.query.status;

    const returns = await ReturnRequest.find(filter)
      .populate("user", "name email")
      .populate("order", "totalPrice")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      returns,
    });
  } catch (error) {
    console.error("Get All Return Requests Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// UPDATE RETURN STATUS (Admin)
// ============================
export const updateReturnStatus = async (req, res) => {
  try {
    const { status, adminNote } = req.body;

    if (
      !["Requested", "Approved", "Rejected", "Picked Up", "Refunded"].includes(
        status,
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const returnRequest = await ReturnRequest.findById(req.params.id).populate(
      "user",
      "name email",
    );

    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: "Return request not found",
      });
    }

    returnRequest.status = status;
    if (adminNote !== undefined) returnRequest.adminNote = adminNote;

    await returnRequest.save();

    notifyCustomer(returnRequest, returnRequest.user.email).catch(() => {});

    res.status(200).json({
      success: true,
      returnRequest,
    });
  } catch (error) {
    console.error("Update Return Status Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
