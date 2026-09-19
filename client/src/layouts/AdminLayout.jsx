import AdminSidebar from "../components/admin/AdminSidebar";
import AdminHeader from "../components/admin/AdminHeader";
import RequirePermission from "../components/admin/RequirePermission";

import "./AdminLayout.css";

function AdminLayout() {
  return (
    <div className="admin-layout">
      <AdminSidebar />

      <div className="admin-main">
        <AdminHeader />

        <main className="admin-content">
          <RequirePermission />
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;
