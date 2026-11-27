import mongoose from "mongoose";
import AdminAuditLog from "../models/AdminAuditLog.js";

// PR-9a (AM-03): read-only list of admin audit entries, newest first.
// Full Admin only (see routes/adminRoutes.js). There is deliberately no
// create/update/delete endpoint -- entries are written only by
// middleware/adminAuditLog.js.

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const positiveInt = (value, fallback) => {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

const dateOrNull = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getAdminAuditLog = async (req, res) => {
  try {
    const { entity, entityId, actor, from, to } = req.query;
    const filter = {};

    if (typeof entity === "string" && entity.trim()) {
      if (!/^[a-z0-9-]{1,50}$/i.test(entity.trim())) {
        return res.status(400).json({ success: false, message: "Invalid record type" });
      }
      filter.entity = String(entity.trim());
    }
    if (typeof entityId === "string" && entityId.trim()) {
      if (entityId.trim().length > 100) {
        return res.status(400).json({ success: false, message: "Invalid record ID" });
      }
      filter.entityId = String(entityId.trim());
    }
    if (typeof actor === "string" && actor.trim()) {
      if (!mongoose.isValidObjectId(actor.trim())) {
        return res.status(400).json({ success: false, message: "Invalid admin ID" });
      }
      filter["actor.id"] = new mongoose.Types.ObjectId(String(actor.trim()));
    }

    const fromDate = dateOrNull(from);
    const toDate = dateOrNull(to);
    if ((from && !fromDate) || (to && !toDate)) {
      return res.status(400).json({ success: false, message: "Invalid date" });
    }
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = fromDate;
      if (toDate) filter.createdAt.$lte = toDate;
    }

    const limit = Math.min(positiveInt(req.query.limit, DEFAULT_LIMIT), MAX_LIMIT);
    const page = positiveInt(req.query.page, 1);

    const [entries, total] = await Promise.all([
      AdminAuditLog.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AdminAuditLog.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      entries,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error("Get Admin Audit Log Error:", error?.message);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
