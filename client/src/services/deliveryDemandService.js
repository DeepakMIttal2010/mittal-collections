import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("adminToken");

// Same filter keys the server reads (parseReportFilters); empty values
// are left out so the server applies its own defaults.
export const DEMAND_FILTER_KEYS = ["from", "to", "region", "source", "state", "district", "pincode", "product", "category"];

const toQuery = (params) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  }
  return query.toString();
};

const getJson = async (path, params) => {
  try {
    const response = await fetch(`${API_BASE_URL}/delivery/demand/${path}?${toQuery(params)}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await response.json();
    return response.ok ? data : { success: false, message: data.message || "Unable to load report" };
  } catch (error) {
    console.error("Delivery Demand Error:", error);
    return { success: false, message: "Unable to load report" };
  }
};

// ==============================
// DELIVERY DEMAND (Admin, "delivery-demand" permission)
// ==============================
export const getDeliveryDemandReport = (filters) => getJson("report", filters);

export const getDeliveryDemandRecords = (filters) => getJson("records", filters);

// Aggregate tables only (state / district / pincode / product).
export const downloadDeliveryDemandCsv = async (table, filters, filename) => {
  try {
    const response = await fetch(`${API_BASE_URL}/delivery/demand/export?${toQuery({ ...filters, table })}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!response.ok) return { success: false };

    const blob = await response.blob();
    const name = filename || `delivery-demand-${table}.csv`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return { success: true };
  } catch (error) {
    console.error("Delivery Demand CSV Error:", error);
    return { success: false };
  }
};
