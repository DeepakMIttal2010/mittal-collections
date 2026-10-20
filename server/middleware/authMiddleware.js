import jwt from "jsonwebtoken";
import User from "../models/User.js";

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // .populate("adminRole") is a no-op for the vast majority of
    // requests (customers, and every full/unrestricted admin, have
    // adminRole: null) — cheap enough to always include rather than
    // conditionally populate only on admin routes.
    const user = await User.findById(decoded.id)
      .select("-password")
      .populate("adminRole");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found.",
      });
    }

    // The only actual server-side token-revocation mechanism this app
    // has (see User model's tokenVersion comment) — logout and password
    // change/reset bump the stored value, which immediately invalidates
    // every token issued before that point once it next hits this check.
    // A token signed before tokenVersion existed carries no claim at all
    // (undefined), treated as version 0 so already-issued sessions don't
    // all break on deploy — only diverge once the user's version actually
    // changes (deep bug sweep, 2026-10-20).
    if ((decoded.tokenVersion || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please log in again.",
      });
    }

    // login() already rejects a blocked account, but that only stops
    // future logins — without this, an already-issued token (valid for
    // up to 7 days) keeps working normally after the block, since this
    // is the only place every authenticated request actually re-checks
    // the user's current state.
    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked. Please contact support.",
      });
    }

    req.user = user;

    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};

export default authMiddleware;
