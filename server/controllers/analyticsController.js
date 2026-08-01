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
    city: geo?.city || "",
  };
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
    const { country, city } = getLocation(req.ip);

    await PageVisit.create({ path, visitorId, device, country, city });

    res.status(201).json({ success: true });
  } catch (error) {
    console.error("Record Visit Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
