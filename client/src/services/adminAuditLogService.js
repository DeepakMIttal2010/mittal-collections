import API_BASE_URL from "./api";

// PR-9a: read-only admin audit log (Full Admin only on the server).
export const AUDIT_FILTER_KEYS = ["entity", "entityId", "actor", "from", "to"];

export const getAdminAuditLog = async (params = {}) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  }
  try {
    const response = await fetch(`${API_BASE_URL}/admin/audit-log?${query.toString()}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("adminToken")}` },
    });
    const data = await response.json();
    return response.ok ? data : { success: false, message: data.message || "Unable to load the audit log" };
  } catch (error) {
    console.error("Admin Audit Log Error:", error);
    return { success: false, message: "Unable to load the audit log" };
  }
};
