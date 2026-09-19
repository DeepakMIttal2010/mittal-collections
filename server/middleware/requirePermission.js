// Always used after authMiddleware + adminMiddleware on a specific
// route. A user with no adminRole (req.user.adminRole is null) is a
// full/unrestricted admin — every account that existed before this
// feature was added, including the owner's own — and bypasses this
// check entirely, so nothing about existing admin access changes.
// Only a staff account created via the "Staff Users" page and assigned
// a Role is ever actually restricted.
//
// req.user.adminRole is the live, populated Role doc (see
// authMiddleware.js's .populate("adminRole")), so a permission change
// the owner makes to a Role takes effect on that staff member's very
// next request — no re-login required.
const requirePermission = (key) => (req, res, next) => {
  if (!req.user.adminRole) return next();

  if (req.user.adminRole.permissions?.includes(key)) return next();

  return res.status(403).json({
    success: false,
    message: "Access denied for this section.",
  });
};

export default requirePermission;
