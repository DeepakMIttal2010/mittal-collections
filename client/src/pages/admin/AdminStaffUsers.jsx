import { useEffect, useState } from "react";

import {
  getStaffUsers,
  addStaffUser,
  updateStaffUser,
  deleteStaffUser,
} from "../../services/staffUserService";
import { getRoles } from "../../services/roleService";
import { getCurrentAdminUser } from "../../services/authService";

const EMPTY_FORM = {
  name: "",
  email: "",
  mobile: "",
  password: "",
  adminRole: "",
};

function AdminStaffUsers() {
  const currentUser = getCurrentAdminUser();

  const [staffUsers, setStaffUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState(EMPTY_FORM);

  const loadData = async () => {
    setLoading(true);

    const [staffRes, rolesRes] = await Promise.all([
      getStaffUsers(),
      getRoles(),
    ]);

    if (staffRes.success) setStaffUsers(staffRes.staffUsers);
    if (rolesRes.success) setRoles(rolesRes.roles);

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSaving(true);

    // Editing an existing account never touches email/mobile/password —
    // those aren't offered as edit fields (name + role + block toggle
    // only), so only send what the edit form actually collects.
    const response = editingId
      ? await updateStaffUser(editingId, {
          name: formData.name,
          adminRole: formData.adminRole || null,
        })
      : await addStaffUser(formData);

    setSaving(false);

    if (response.success) {
      resetForm();
      loadData();
    } else {
      alert(response.message || "Something went wrong");
    }
  };

  const handleEdit = (item) => {
    setEditingId(item._id);
    setFormData({
      name: item.name,
      email: item.email,
      mobile: item.mobile || "",
      password: "",
      adminRole: item.adminRole?._id || "",
    });
  };

  const handleToggleBlock = async (item) => {
    const response = await updateStaffUser(item._id, {
      isBlocked: !item.isBlocked,
    });

    if (response.success) {
      loadData();
    } else {
      alert(response.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this staff account?")) return;

    const response = await deleteStaffUser(id);

    if (response.success) {
      loadData();
    } else {
      alert(response.message);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-2">Staff Users</h2>
      <p className="text-sm text-slate-500 mb-6">
        Create admin-panel login accounts for your team and assign each one
        a role. Define roles first on the Roles & Permissions page.
      </p>

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl p-6 mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end"
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Name
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Email
          </label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            disabled={!!editingId}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
          />
        </div>

        {!editingId && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Mobile (optional)
              </label>
              <input
                type="tel"
                name="mobile"
                value={formData.mobile}
                onChange={handleChange}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Password
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={6}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Role
          </label>
          <select
            name="adminRole"
            value={formData.adminRole}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Full Admin (all access)</option>
            {roles.map((role) => (
              <option key={role._id} value={role._id}>
                {role.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
          >
            {saving ? "Saving..." : editingId ? "Update" : "+ Add"}
          </button>

          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {staffUsers.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-white rounded-lg border border-slate-200">
          No staff accounts yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Name</th>
                <th className="text-left px-4 py-3 font-semibold">Email</th>
                <th className="text-left px-4 py-3 font-semibold">Role</th>
                <th className="text-center px-4 py-3 font-semibold">
                  Status
                </th>
                <th className="text-center px-4 py-3 font-semibold">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {staffUsers.map((item) => {
                const isSelf = item._id === currentUser?.id;

                return (
                  <tr key={item._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {item.name}
                      {isSelf && (
                        <span className="ml-2 text-xs text-slate-400">
                          (you)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.email}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.adminRole?.name || "Full Admin"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          item.isBlocked
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {item.isBlocked ? "Blocked" : "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(item)}
                          disabled={isSelf}
                          title={isSelf ? "You can't change your own access here" : undefined}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleBlock(item)}
                          disabled={isSelf}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {item.isBlocked ? "Unblock" : "Block"}
                        </button>
                        <button
                          onClick={() => handleDelete(item._id)}
                          disabled={isSelf}
                          title={isSelf ? "You can't delete your own account" : undefined}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AdminStaffUsers;
