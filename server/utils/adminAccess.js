// For routes shared between a resource's owner and an admin (e.g. a
// customer viewing their own order alongside an admin viewing any
// order) — requirePermission.js can't be used directly there, since
// it assumes adminMiddleware already ran and every request is an
// admin's. This mirrors its exact same rule (no adminRole = full,
// unrestricted admin; otherwise must have the key in
// adminRole.permissions) so a restricted staff account without a
// section's permission can't view that section's data just by
// hitting a single-resource route instead of the gated list route.
export const hasAdminPermission = (user, key) => {
  if (user.role !== "admin") return false;
  if (!user.adminRole) return true;
  return user.adminRole.permissions?.includes(key) ?? false;
};
