import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("adminToken");

// One small wrapper for the whole expense ledger API. Always resolves to
// { success, status, message, ...payload } -- never throws -- so the page
// can show an inline message instead of crashing on a network error.
async function call(path, { method = "GET", body } = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/expenses${path}`, {
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
    console.error("Expense API Error:", error);

    return { success: false, status: 0, message: "Unable to reach the server" };
  }
}

export const getExpenses = ({ from, to, category } = {}) => {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (category) params.set("category", category);

  const query = params.toString();
  return call(query ? `?${query}` : "");
};

export const createExpense = (body) => call("", { method: "POST", body });
export const updateExpense = (id, body) => call(`/${id}`, { method: "PUT", body });
export const deleteExpense = (id) => call(`/${id}`, { method: "DELETE" });

export const getRecurringExpenses = () => call("/recurring");
export const createRecurringExpense = (body) => call("/recurring", { method: "POST", body });
export const updateRecurringExpense = (id, body) => call(`/recurring/${id}`, { method: "PUT", body });
export const stopRecurringExpense = (id) => call(`/recurring/${id}`, { method: "DELETE" });
