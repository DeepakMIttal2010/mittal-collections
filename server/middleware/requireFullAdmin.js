// Full Admin only: an admin with no restricted staff role (adminRole is
// null). Restricted staff are refused whatever permissions their role
// holds. Use after authMiddleware + adminMiddleware.
const requireFullAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin" || req.user.adminRole) {
    return res.status(403).json({
      success: false,
      message: "Access denied. Full Admin only.",
    });
  }

  next();
};

export default requireFullAdmin;
