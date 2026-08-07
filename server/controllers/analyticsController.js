import geoip from "geoip-lite";

import PageVisit from "../models/PageVisit.js";

const getDeviceType = (userAgent = "") => {
  const ua = userAgent.toLowerCase();

  if (/tablet|ipad/.test(ua)) return "Tablet";
  if (/mobi|android|iphone/.test(ua)) return "Mobile";

  return "Desktop";
};

const getLocation = (rawIp = "") => {
  const ip = rawIp.replace("::ffff:", "");
  const geo = geoip.lookup(ip);

  return {
    country: geo?.country || "",
    region: geo?.region || "",
    city: geo?.city || "",
  };
};

// ============================
// Get Product View Count — last 24h (Public)
// ============================
export const getProductViewCount = async (req, res) => {
  try {
    const { id } = req.params;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const visitorIds = await PageVisit.distinct("visitorId", {
      path: `/product/${id}`,
      createdAt: { $gte: since },
    });

    res.json({
      success: true,
      count: visitorIds.length,
    });
  } catch (error) {
    console.error("Get Product View Count Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Get My Location — IP-based approximate city (Public)
// ============================
export const getMyLocation = async (req, res) => {
  try {
    const { country, region, city } = getLocation(req.ip);

    res.json({
      success: true,
      location: { country, region, city },
    });
  } catch (error) {
    console.error("Get My Location Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Record Page Visit (Public)
// ============================
export const recordVisit = async (req, res) => {
  try {
    const { path, visitorId } = req.body;

    if (!path || !visitorId) {
      return res.status(400).json({
        success: false,
        message: "path and visitorId are required",
      });
    }

    const device = getDeviceType(req.headers["user-agent"]);
    const { country, region, city } = getLocation(req.ip);

    await PageVisit.create({ path, visitorId, device, country, region, city });

    res.status(201).json({ success: true });
  } catch (error) {
    console.error("Record Visit Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
