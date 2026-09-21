// A restricted staff account (req.user.adminRole set) must never be
// able to grant a Role — either by creating/editing one, or by
// assigning an existing one to a staff account — broader access than
// it holds itself. A full/unrestricted admin (adminRole: null) has no
// such ceiling. Without this, a staff account holding both "roles"
// and "staff-users" permissions could mint a Role with every
// permission/writeAccess key and assign it to a new or existing staff
// account, bypassing the explicit "grant Full Admin" gate entirely
// (see staffUserController.js's addStaffUser/updateStaffUser, which
// only guards the adminRole: null case).
export const isSubsetOfCallerAccess = (
  caller,
  { permissions = [], writeAccess = [] },
) => {
  if (!caller.adminRole) return true; // full/unrestricted admin

  const callerPermissions = caller.adminRole.permissions || [];
  const callerWriteAccess = caller.adminRole.writeAccess || [];

  return (
    permissions.every((key) => callerPermissions.includes(key)) &&
    writeAccess.every((key) => callerWriteAccess.includes(key))
  );
};
