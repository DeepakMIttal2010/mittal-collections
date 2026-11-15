import jwt from "jsonwebtoken";
import User from "../models/User.js";

// Like authMiddleware, but a missing, invalid, expired or revoked token
// (or a blocked account) never fails the request — it just leaves
// req.user unset, so the route treats the caller as a guest. For public
// endpoints that only *add* something when a real customer is signed in.
const optionalAuth = async (req, res, next) => {
  req.user = null;

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return next();

  try {
    const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("role tokenVersion isBlocked").lean();

    if (user && !user.isBlocked && (decoded.tokenVersion || 0) === (user.tokenVersion || 0)) {
      req.user = user;
    }
  } catch {
    // Treated as a guest.
  }

  return next();
};

export default optionalAuth;
