// Mirrors requirePermission.js exactly, for the second, additive
// "<moduleKey>:<action>" right on Role.writeAccess (see
// config/adminPermissions.js's GRANULAR_MODULES). A user with no
// adminRole (full/unrestricted admin) bypasses this entirely — the
// same fallback requirePermission.js uses, so nothing about an
// existing admin account's behavior changes.
const requireWriteAccess = (key, action) => (req, res, next) => {
  if (!req.user.adminRole) return next();

  if (req.user.adminRole.writeAccess?.includes(`${key}:${action}`)) return next();

  return res.status(403).json({
    success: false,
    message: "Access denied for this action.",
  });
};

export default requireWriteAccess;
