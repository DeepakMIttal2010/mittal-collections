import { useEffect, useState } from "react";
import { getMyOrders } from "../services/orderService";
import "./MyOrders.css";

function MyOrders() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const loadOrders = async () => {
      const response = await getMyOrders();

      if (response.success) {
        setOrders(response.orders);
      }
    };

    loadOrders();
  }, []);

  return (
    <div className="container">
      <h2>My Orders</h2>

      {orders.length === 0 ? (
        <p>No Orders Found.</p>
      ) : (
        orders.map((order) => (
          <div className="order-card" key={order._id}>
            <h4>Order ID: {order._id}</h4>

            <p>Total: ₹{order.totalPrice}</p>

            <p>Status: {order.orderStatus}</p>

            <p>Date: {new Date(order.createdAt).toLocaleDateString()}</p>
          </div>
        ))
      )}
    </div>
  );
}

export default MyOrders;
