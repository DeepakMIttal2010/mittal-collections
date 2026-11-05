import API_BASE_URL from "./api";

const getToken = () => localStorage.getItem("token");
const getAdminToken = () => localStorage.getItem("adminToken");

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
});

const adminAuthHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getAdminToken()}`,
});

export const createTicket = async ({ subject, message, order }) => {
  try {
    const response = await fetch(`${API_BASE_URL}/tickets`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ subject, message, order }),
    });

    return await response.json();
  } catch (error) {
    console.error("Create Ticket Error:", error);
    return { success: false, message: "Unable to submit ticket" };
  }
};

export const getMyTickets = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/tickets/my`, {
      headers: authHeaders(),
    });

    return await response.json();
  } catch (error) {
    console.error("Get My Tickets Error:", error);
    return { success: false, tickets: [] };
  }
};

export const getTicketById = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/tickets/${id}`, {
      headers: authHeaders(),
    });

    return await response.json();
  } catch (error) {
    console.error("Get Ticket Error:", error);
    return { success: false };
  }
};

export const addTicketMessage = async (id, message) => {
  try {
    const response = await fetch(`${API_BASE_URL}/tickets/${id}/messages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ message }),
    });

    return await response.json();
  } catch (error) {
    console.error("Add Ticket Message Error:", error);
    return { success: false, message: "Unable to send message" };
  }
};

// Admin panel versions of getTicketById / addTicketMessage. The admin panel
// keeps its own login (adminToken), separate from the storefront's
// (token) — sending the storefront token from the admin ticket page meant
// an admin logged in only to the admin panel got "Ticket not found" and
// couldn't reply. The server decides "admin" vs "customer" from whose
// token it receives, so admin replies must carry the admin token.
export const getTicketByIdAdmin = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/tickets/${id}`, {
      headers: adminAuthHeaders(),
    });

    return await response.json();
  } catch (error) {
    console.error("Get Ticket (Admin) Error:", error);
    return { success: false };
  }
};

export const addTicketMessageAdmin = async (id, message) => {
  try {
    const response = await fetch(`${API_BASE_URL}/tickets/${id}/messages`, {
      method: "POST",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ message }),
    });

    return await response.json();
  } catch (error) {
    console.error("Add Ticket Message (Admin) Error:", error);
    return { success: false, message: "Unable to send message" };
  }
};

export const getAllTicketsAdmin = async (status) => {
  try {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const response = await fetch(`${API_BASE_URL}/tickets/admin${query}`, {
      headers: adminAuthHeaders(),
    });

    return await response.json();
  } catch (error) {
    console.error("Get All Tickets Error:", error);
    return { success: false, tickets: [] };
  }
};

export const updateTicketStatus = async (id, status) => {
  try {
    const response = await fetch(`${API_BASE_URL}/tickets/${id}/status`, {
      method: "PUT",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ status }),
    });

    return await response.json();
  } catch (error) {
    console.error("Update Ticket Status Error:", error);
    return { success: false };
  }
};

export const markTicketSeen = async (id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/tickets/${id}/seen`, {
      method: "PUT",
      headers: adminAuthHeaders(),
    });

    return await response.json();
  } catch (error) {
    console.error("Mark Ticket Seen Error:", error);
    return { success: false };
  }
};
