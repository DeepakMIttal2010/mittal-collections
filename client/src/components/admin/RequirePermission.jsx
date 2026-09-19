import { Outlet, Link, useLocation } from "react-router-dom";

import { getCurrentAdminUser } from "../../services/authService";
import {
  permissionForPath,
  PERMISSION_GROUPS,
  writeAccessForPath,
  hasWriteAccess,
} from "../../config/adminPermissions";

// Sits inside AdminLayout, wrapping every nested admin route's <Outlet/>
// in one place — the alternative (gating each of the ~30 individual
// <Route> elements in AppRoutes.jsx) would mean the same check repeated
// on every route line instead of once here.
function firstPermittedPath(permissions) {
  for (const group of PERMISSION_GROUPS) {
    for (const item of group.items) {
      if (permissions.includes(item.key)) return item.to;
    }
  }
  return null;
}

function RequirePermission() {
  const location = useLocation();
  const user = getCurrentAdminUser();

  // No adminRole = full/unrestricted admin — unchanged behavior for
  // every account that existed before this feature.
  if (!user?.adminRole) return <Outlet />;

  const requiredKey = permissionForPath(location.pathname);
  const permissions = user.adminRole.permissions || [];

  // A path with no matching permission key (shouldn't normally happen —
  // every admin route belongs to a section) is allowed through rather
  // than blocked, so a config gap fails open to "visible" instead of
  // silently locking out a legitimate page.
  const viewAllowed = !requiredKey || permissions.includes(requiredKey);

  // Products/Categories have real /add and /edit/:id routes — typing
  // one directly needs the matching write action, not just view access
  // to the section's list page.
  const writeEntry = writeAccessForPath(location.pathname);
  const writeAllowed =
    !writeEntry || hasWriteAccess(user, writeEntry.key, writeEntry.action);

  if (viewAllowed && writeAllowed) {
    return <Outlet />;
  }

  const fallback = firstPermittedPath(permissions);

  return (
    <div className="max-w-lg mx-auto px-4 py-24 text-center">
      <p className="text-sm font-semibold text-amber-600 mb-3">
        Access restricted
      </p>
      <h1 className="text-2xl font-bold text-slate-900 mb-4">
        You don&apos;t have access to this section
      </h1>
      <p className="text-slate-600 mb-8">
        Contact your admin if you think this is a mistake.
      </p>
      {fallback && (
        <Link
          to={fallback}
          className="inline-block bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-8 py-3.5 transition-colors"
        >
          Go to your dashboard
        </Link>
      )}
    </div>
  );
}

export default RequirePermission;
