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
