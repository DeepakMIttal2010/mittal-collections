const adminMiddleware = (req, res, next) => {
  // Ye middleware hamesha authMiddleware ke BAAD lagana hai,
  // taaki req.user already set ho chuka ho.
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Access denied. Please login first.",
    });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Access denied. Admins only.",
    });
  }

  next();
};

export default adminMiddleware;
