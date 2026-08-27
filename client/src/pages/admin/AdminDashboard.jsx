import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminDashboard.css";

import {
  FaBoxOpen,
  FaShoppingCart,
  FaUsers,
  FaRupeeSign,
} from "react-icons/fa";

import { getDashboardData } from "../../services/adminService";

function AdminDashboard() {
  const navigate = useNavigate();

  const [dashboard, setDashboard] = useState({
    totalProducts: 0,
    totalOrders: 0,
    totalUsers: 0,
    totalSales: 0,
    recentOrders: [],
    recentProducts: [],
  });

  const [loading, setLoading] = useState(true);

  const loadDashboard = async () => {
    const response = await getDashboardData();

    if (response.success) {
      setDashboard(response.data);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const dashboardData = [
    {
      title: "Total Products",
      value: dashboard.totalProducts,
      icon: <FaBoxOpen />,
      color: "#2563eb",
      link: "/admin/products",
    },
    {
      title: "Total Orders",
      value: dashboard.totalOrders,
      icon: <FaShoppingCart />,
      color: "#16a34a",
      link: "/admin/orders",
    },
    {
      title: "Total Users",
      value: dashboard.totalUsers,
      icon: <FaUsers />,
      color: "#f59e0b",
      link: "/admin/customers",
    },
    {
      title: "Total Sales",
      value: `₹${dashboard.totalSales}`,
      icon: <FaRupeeSign />,
      color: "#dc2626",
      link: "/admin/orders",
    },
  ];

  if (loading) {
    return <h2 style={{ padding: 30 }}>Loading Dashboard...</h2>;
  }

  return (
    <>
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p>Welcome to Mittal Collections Admin Panel</p>
      </div>

      <div className="dashboard-cards">
        {dashboardData.map((card, index) => (
          <div
            className="dashboard-card"
            key={index}
            role="button"
            tabIndex={0}
            onClick={() => navigate(card.link)}
            onKeyDown={(e) => e.key === "Enter" && navigate(card.link)}
            style={{ cursor: "pointer" }}
          >
            <div className="dashboard-icon" style={{ background: card.color }}>
              {card.icon}
            </div>

            <div>
              <h2>{card.value}</h2>
              <p>{card.title}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-section">
        <div className="recent-orders">
          <h2>Recent Orders</h2>

          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Total</th>
              </tr>
            </thead>

            <tbody>
              {dashboard.recentOrders.length === 0 ? (
                <tr>
                  <td colSpan="4">No Orders Found</td>
                </tr>
              ) : (
                dashboard.recentOrders.map((order) => (
                  <tr
                    key={order._id}
                    className="clickable-row"
                    onClick={() =>
                      navigate(`/admin/orders?highlight=${order._id}`)
                    }
                  >
                    <td>{order._id.slice(-6)}</td>

                    <td>{order.user?.name || "Guest"}</td>

                    <td>{order.orderStatus}</td>

                    <td>₹{order.totalPrice}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default AdminDashboard;
