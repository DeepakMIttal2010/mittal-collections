import { useEffect, useState } from "react";

import { getRoles, addRole, updateRole, deleteRole } from "../../services/roleService";
import { PERMISSION_GROUPS } from "../../config/adminPermissions";

const EMPTY_FORM = { name: "", description: "", permissions: [] };

function AdminRoles() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState(EMPTY_FORM);

  const loadData = async () => {
    setLoading(true);

    const response = await getRoles();

    if (response.success) setRoles(response.roles);

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const togglePermission = (key) => {
    setFormData((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter((k) => k !== key)
        : [...prev.permissions, key],
    }));
  };

  const toggleGroup = (group, checkAll) => {
    const keys = group.items.map((item) => item.key);
    setFormData((prev) => ({
      ...prev,
      permissions: checkAll
        ? [...new Set([...prev.permissions, ...keys])]
        : prev.permissions.filter((k) => !keys.includes(k)),
    }));
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSaving(true);

    const response = editingId
      ? await updateRole(editingId, formData)
      : await addRole(formData);

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
      description: item.description || "",
      permissions: item.permissions || [],
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this role?")) return;

    const response = await deleteRole(id);

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
      <h2 className="text-2xl font-bold text-slate-800 mb-2">
        Roles & Permissions
      </h2>
      <p className="text-sm text-slate-500 mb-6">
        Define which admin sections a role can access, then assign it to a
        staff account from the Staff Users page.
      </p>

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl p-6 mb-8"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Role name
            </label>
            <input
              type="text"
              name="name"
              placeholder="e.g. Stock Manager"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              name="description"
              placeholder="What this role is for"
              value={formData.description}
              onChange={handleChange}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <label className="block text-sm font-medium text-slate-700 mb-3">
          Access
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {PERMISSION_GROUPS.map((group) => {
            const keys = group.items.map((item) => item.key);
            const allChecked = keys.every((k) =>
              formData.permissions.includes(k),
            );

            return (
              <div
                key={group.label}
                className="border border-slate-200 rounded-lg p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {group.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group, !allChecked)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {allChecked ? "Clear" : "All"}
                  </button>
                </div>

                <div className="space-y-1.5">
                  {group.items.map((item) => (
                    <label
                      key={item.key}
                      className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={formData.permissions.includes(item.key)}
                        onChange={() => togglePermission(item.key)}
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-60"
          >
            {saving ? "Saving..." : editingId ? "Update Role" : "+ Add Role"}
          </button>

          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="px-5 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {roles.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-white rounded-lg border border-slate-200">
          No roles yet — every account without a role stays a full admin.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Name</th>
                <th className="text-left px-4 py-3 font-semibold">
                  Description
                </th>
                <th className="text-left px-4 py-3 font-semibold">
                  Sections
                </th>
                <th className="text-center px-4 py-3 font-semibold">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {roles.map((item) => (
                <tr key={item._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {item.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.description}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.permissions.length} section
                    {item.permissions.length === 1 ? "" : "s"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleEdit(item)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item._id)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white"
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
      )}
    </div>
  );
}

export default AdminRoles;
