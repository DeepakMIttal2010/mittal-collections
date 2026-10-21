import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("adminToken");

// One wrapper for the whole accounts API. Always resolves to
// { success, status, message, ...payload } and never throws, so a page can
// show an inline message instead of crashing on a network error.
async function call(path, { method = "GET", body } = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/accounts${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${getToken()}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));

    return { ...data, success: !!data.success, status: response.status };
  } catch (error) {
    console.error("Accounts API Error:", error);

    return { success: false, status: 0, message: "Unable to reach the server" };
  }
}

const qs = (params) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && p.set(k, v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

// Brings the books in line with orders, returns, POS sales, expenses and
// the live stock value. Idempotent; safe to call whenever.
export const syncBooks = () => call("/sync", { method: "POST" });

// name: "trial-balance" | "balance-sheet" | "trading-pl" | "group-summary" |
// "day-book" | "ledger/<id>"; params: { from, to } or { asOf } (+ filters).
export const getReport = (name, params = {}) => call(`/reports/${name}${qs(params)}`);

export const getAccountingSettings = () => call("/settings");
export const updateAccountingSettings = (body) => call("/settings", { method: "PUT", body });

export const getGroups = () => call("/groups");
export const createGroup = (body) => call("/groups", { method: "POST", body });
export const updateGroup = (id, body) => call(`/groups/${id}`, { method: "PUT", body });
export const deleteGroup = (id) => call(`/groups/${id}`, { method: "DELETE" });

export const getLedgers = () => call("/ledgers");
export const createLedger = (body) => call("/ledgers", { method: "POST", body });
export const updateLedger = (id, body) => call(`/ledgers/${id}`, { method: "PUT", body });
export const deleteLedger = (id) => call(`/ledgers/${id}`, { method: "DELETE" });

export const getVouchers = (filters = {}) => call(`/vouchers${qs(filters)}`);
export const createVoucher = (body) => call("/vouchers", { method: "POST", body });
export const updateVoucher = (id, body) => call(`/vouchers/${id}`, { method: "PUT", body });
export const deleteVoucher = (id) => call(`/vouchers/${id}`, { method: "DELETE" });
