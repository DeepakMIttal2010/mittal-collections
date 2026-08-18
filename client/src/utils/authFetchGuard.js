// Every authenticated request in this app goes through server middleware
// (authMiddleware/adminMiddleware) that returns 401 the moment a token's
// user no longer resolves — deleted, blocked, or the token itself is
// invalid/expired. Without this guard, a deleted/blocked customer's (or
// admin's) browser just kept its cached token/user in localStorage
// forever: the header still showed them "logged in" and only the next
// feature they actually tried to use would quietly fail, one request at a
// time, with no real logout ever happening.
//
// Patches the global fetch once at app startup so every request — no
// matter which service file makes it — gets this check for free, without
// having to route every existing `fetch()` call through a shared wrapper.
export function installAuthFetchGuard() {
  const originalFetch = window.fetch;

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    if (response.status !== 401) return response;

    const [, init] = args;
    const authHeader =
      init?.headers?.Authorization || init?.headers?.authorization;

    if (!authHeader) return response;

    const sentToken = authHeader.replace(/^Bearer\s+/i, "");
    const adminToken = localStorage.getItem("adminToken");
    const customerToken = localStorage.getItem("token");

    if (adminToken && sentToken === adminToken) {
      localStorage.removeItem("adminToken");
      localStorage.removeItem("adminUser");

      if (!window.location.pathname.startsWith("/admin/login")) {
        window.location.href = `/admin/login?redirect=${encodeURIComponent(
          window.location.pathname + window.location.search,
        )}`;
      }
    } else if (customerToken && sentToken === customerToken) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");

      if (window.location.pathname !== "/login") {
        window.location.href = `/login?redirect=${encodeURIComponent(
          window.location.pathname + window.location.search,
        )}`;
      }
    }

    return response;
  };
}
