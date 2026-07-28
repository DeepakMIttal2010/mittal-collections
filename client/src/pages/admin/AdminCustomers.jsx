import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  getAllCustomers,
  toggleBlockCustomer,
  deleteCustomer,
} from "../../services/adminCustomerService";

function AdminCustomers() {
  const [customers, setCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    const q = search.toLowerCase();

    const result = customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(q) ||
        customer.email.toLowerCase().includes(q) ||
        customer.mobile.includes(q),
    );

    setFilteredCustomers(result);
  }, [search, customers]);

  const loadCustomers = async () => {
    setLoading(true);

    const response = await getAllCustomers();

    if (response.success) {
      setCustomers(response.customers);
      setFilteredCustomers(response.customers);
    }

    setLoading(false);
  };

  const handleToggleBlock = async (id) => {
    setUpdatingId(id);

    const response = await toggleBlockCustomer(id);

    if (response.success) {
      setCustomers((prev) =>
        prev.map((c) =>
          c._id === id ? { ...c, isBlocked: response.isBlocked } : c,
        ),
      );
    } else {
      alert(response.message || "Unable to update customer status");
    }

    setUpdatingId(null);
  };

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this customer? This cannot be undone.",
    );

    if (!confirmDelete) return;

    const response = await deleteCustomer(id);

    if (response.success) {
      loadCustomers();
    } else {
      alert(response.message);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">
        Loading Customers...
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800">
          Manage Customers
        </h2>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by name, email or mobile..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md border border-slate-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {filteredCustomers.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-white rounded-lg border border-slate-200">
          No Customers Found
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Name</th>
                  <th className="text-left px-4 py-3 font-semibold">
                    Contact
                  </th>
                  <th className="text-left px-4 py-3 font-semibold">
                    Joined
                  </th>
                  <th className="text-center px-4 py-3 font-semibold">
                    Orders
                  </th>
                  <th className="text-right px-4 py-3 font-semibold">
                    Total Spent
                  </th>
                  <th className="text-center px-4 py-3 font-semibold">
                    Status
                  </th>
                  <th className="text-center px-4 py-3 font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((customer) => (
                  <tr key={customer._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/customers/${customer._id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {customer.name}
                      </Link>
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      <div>{customer.email}</div>
                      <div className="text-xs text-slate-400">
                        {customer.mobile}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {new Date(customer.createdAt).toLocaleDateString(
                        "en-IN",
                        {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        },
                      )}
                    </td>

                    <td className="px-4 py-3 text-center text-slate-700">
                      {customer.totalOrders}
                    </td>

                    <td className="px-4 py-3 text-right font-medium text-slate-800">
                      ₹{customer.totalSpent}
                    </td>

                    <td className="px-4 py-3 text-center">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          customer.isBlocked
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {customer.isBlocked ? "Blocked" : "Active"}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleToggleBlock(customer._id)}
                          disabled={updatingId === customer._id}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 ${
                            customer.isBlocked
                              ? "bg-green-600 hover:bg-green-700 text-white"
                              : "bg-amber-500 hover:bg-amber-600 text-white"
                          }`}
                        >
                          {customer.isBlocked ? "Unblock" : "Block"}
                        </button>

                        <button
                          onClick={() => handleDelete(customer._id)}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminCustomers;
