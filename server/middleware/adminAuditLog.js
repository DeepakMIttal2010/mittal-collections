import AdminAuditLog from "../models/AdminAuditLog.js";

// PR-9a (AM-03): records every write request made by a logged-in admin
// -- Full Admin or restricted staff, successful or refused -- once the
// response is over. Mounted once in app.js ahead of every /api router,
// so no route file needs to remember to call it.
//
// Logged: who (from req.user, set by authMiddleware), method, the
// registered route pattern, the path without its query string, the
// record id when the route carries one, the status code and the NAMES of
// the submitted body fields.
// Never logged: field values, headers (so no token), IP address, query
// string, uploaded files (multer keeps those on req.file/req.files, not
// in req.body).
// Not logged: GET/HEAD/OPTIONS, requests without a logged-in admin
// (anonymous, bad token, customers) and the "seen"/"read" markers.
//
// The entry is written after the response, and a failed write only goes
// to the server log (error type and code only) -- the admin action itself
// is never affected.

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// Seen/read markers: PUT .../:id/seen, .../:id/read, .../mark-all-read.
const MARKER_PATH = /\/(seen|read|mark-all-read)\/?$/;
const MAX_FIELDS = 50;
const MAX_FIELD_NAME = 64;
const MAX_ID_LENGTH = 100;

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// What a failed audit write may put in the server log: the error's type
// and code, and only when they look like an identifier. Never its message
// or other properties -- a database message can echo stored values or
// connection details.
const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9]{0,39}$/;
const SAFE_ERROR_CODE = /^[A-Za-z0-9_]{1,40}$/;
const safeErrorLabel = (error) => {
  const name = typeof error?.name === "string" && SAFE_ERROR_NAME.test(error.name) ? error.name : "Error";
  const rawCode = error?.code;
  let code = "none";
  if (Number.isInteger(rawCode)) code = String(rawCode);
  else if (typeof rawCode === "string" && SAFE_ERROR_CODE.test(rawCode)) code = rawCode;
  return `${name} (code: ${code})`;
};

// The route pattern is only trusted when it really matches the path --
// e.g. after an error has bubbled out of a router, req.baseUrl is reset
// and baseUrl + route.path no longer describes this request.
const confirmedRoutePattern = (req, path) => {
  const routePath = req.route?.path;
  if (typeof routePath !== "string") return null;
  const pattern = `${req.baseUrl || ""}${routePath === "/" ? "" : routePath}` || "/";
  const matcher = new RegExp(
    `^${pattern
      .split("/")
      .map((segment) => (segment.startsWith(":") ? "[^/]+" : escapeRegExp(segment)))
      .join("/")}/?$`,
  );
  return matcher.test(path) ? pattern : null;
};

// The first path segment after /api (and after /api/admin): orders,
// products, staff, pos, accounts...
const entityOf = (path) => {
  const segments = path.split("/").filter(Boolean);
  const rest = segments[0] === "api" ? segments.slice(1) : segments;
  const named = rest[0] === "admin" && rest.length > 1 ? rest[1] : rest[0];
  return String(named || "unknown").slice(0, 50);
};

const recordIdOf = (req, route) => {
  if (!route) return undefined;
  const value = req.params?.id ?? req.params?.slug;
  if (typeof value !== "string" || !value || value.length > MAX_ID_LENGTH) return undefined;
  return route.includes(":id") || route.includes(":slug") ? value : undefined;
};

const fieldNamesOf = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  return Object.keys(body)
    .slice(0, MAX_FIELDS)
    .map((name) => String(name).slice(0, MAX_FIELD_NAME));
};

const adminAuditLog = (req, res, next) => {
  if (READ_ONLY_METHODS.has(req.method)) return next();

  let recorded = false;
  const record = () => {
    // "finish" and then "close" both fire for a normal response: one entry.
    if (recorded) return;
    recorded = true;
    res.removeListener("finish", record);
    res.removeListener("close", record);

    const user = req.user;
    if (!user || user.role !== "admin") return;

    const path = String(req.originalUrl || req.url || "").split("?")[0];
    if (MARKER_PATH.test(path)) return;

    const route = confirmedRoutePattern(req, path);
    const finished = res.writableFinished;
    const statusCode = Number(res.statusCode) || 0;

    AdminAuditLog.create({
      actor: {
        id: user._id,
        name: typeof user.name === "string" ? user.name : "",
        fullAdmin: !user.adminRole,
        roleName: user.adminRole ? String(user.adminRole.name || "") : null,
      },
      method: req.method,
      route,
      path,
      entity: entityOf(path),
      entityId: recordIdOf(req, route),
      statusCode,
      outcome: !finished ? "aborted" : statusCode >= 400 ? "failed" : "success",
      fields: fieldNamesOf(req.body),
    }).catch((error) => {
      // One plain string: method, route pattern, safe error type + code.
      console.error(
        `Admin audit log write failed (${req.method} ${route || "unmatched route"}): ${safeErrorLabel(error)}`,
      );
    });
  };

  res.on("finish", record);
  res.on("close", record);
  next();
};

export default adminAuditLog;
