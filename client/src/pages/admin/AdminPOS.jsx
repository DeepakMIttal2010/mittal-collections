import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

import {
  getProductForPOS,
  lookupCustomerByMobile,
  recordOfflineSale,
} from "../../services/posService";
import { imgUrl } from "../../services/api";

const PAYMENT_METHODS = ["Cash", "UPI", "Card"];

function AdminPOS() {
  const { id } = useParams();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [customerMobile, setCustomerMobile] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerFound, setCustomerFound] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sale, setSale] = useState(null);

  useEffect(() => {
    const loadProduct = async () => {
      const response = await getProductForPOS(id);

      if (response.success) {
        setProduct(response.product);
        setUnitPrice(response.product.price);
      } else {
        setNotFound(true);
      }

      setLoading(false);
    };

    loadProduct();
  }, [id]);

  const handleMobileBlur = async () => {
    if (!/^[6-9]\d{9}$/.test(customerMobile)) {
      setCustomerFound(false);
      return;
    }

    setLookingUp(true);
    const response = await lookupCustomerByMobile(customerMobile);
    setLookingUp(false);

    if (response.success && response.customer) {
      setCustomerName(response.customer.name);
      setCustomerFound(true);
    } else {
      setCustomerFound(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (quantity > product.stock) {
      setError(`Only ${product.stock} in stock`);
      return;
    }

    setSubmitting(true);

    const response = await recordOfflineSale({
      productId: id,
      quantity,
      unitPrice,
      paymentMethod,
      customerMobile,
      customerName,
    });

    setSubmitting(false);

    if (response.success) {
      setSale(response.sale);
    } else {
      setError(response.message || "Unable to record sale");
    }
  };

  const whatsappLink = () => {
    const total = sale.quantity * sale.unitPrice;
    const text = [
      "Mittal Collections - Bill Receipt",
      `Product: ${sale.productName}`,
      `Quantity: ${sale.quantity}`,
      `Price: ₹${sale.unitPrice} x ${sale.quantity} = ₹${total}`,
      `Payment: ${sale.paymentMethod}`,
      `Date: ${new Date(sale.createdAt).toLocaleString("en-IN")}`,
      "",
      "Thank you for shopping with us!",
    ].join("\n");

    return `https://wa.me/91${sale.customerMobile}?text=${encodeURIComponent(text)}`;
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
  }

  if (notFound) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500 mb-4">Product not found.</p>
        <Link to="/admin/products" className="text-blue-700 hover:underline">
          ← Back to Products
        </Link>
      </div>
    );
  }

  // ===== Receipt view (after a successful sale) =====
  if (sale) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <div className="bg-white border border-slate-200 rounded-xl p-6 print:border-0">
          <h2 className="text-xl font-bold text-slate-800 mb-1">
            Mittal Collections
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            {new Date(sale.createdAt).toLocaleString("en-IN")}
          </p>

          <div className="border-t border-b border-slate-100 py-4 mb-4 text-sm">
            <div className="flex justify-between mb-1">
              <span>{sale.productName}</span>
              <span>
                {sale.quantity} × ₹{sale.unitPrice}
              </span>
            </div>
            {sale.customerName && (
              <p className="text-slate-500 mt-2">
                Customer: {sale.customerName}
                {sale.customerMobile && ` (${sale.customerMobile})`}
              </p>
            )}
            <p className="text-slate-500">Payment: {sale.paymentMethod}</p>
            {sale.loyaltyPointsAwarded > 0 && (
              <p className="text-green-600 mt-1">
                +{sale.loyaltyPointsAwarded} loyalty points awarded
              </p>
            )}
          </div>

          <div className="flex justify-between text-lg font-bold text-slate-900 mb-6">
            <span>Total</span>
            <span>₹{sale.quantity * sale.unitPrice}</span>
          </div>

          <div className="flex flex-col gap-3 print:hidden">
            <button
              onClick={() => window.print()}
              className="bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full py-3 transition-colors"
            >
              Print Invoice
            </button>

            {sale.customerMobile && (
              <a
                href={whatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-green-600 hover:bg-green-700 text-white font-semibold rounded-full py-3 text-center transition-colors"
              >
                Send Bill on WhatsApp
              </a>
            )}

            <Link
              to={`/admin/pos/${id}`}
              onClick={() => window.location.reload()}
              className="border-2 border-blue-900 text-blue-900 font-semibold rounded-full py-3 text-center transition-colors"
            >
              New Sale — Same Product
            </Link>

            <Link
              to="/admin/products"
              className="text-sm text-slate-500 text-center hover:underline"
            >
              Back to Products
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ===== Sale form =====
  return (
    <div className="p-6 max-w-md mx-auto">
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex gap-4 mb-6">
          <img
            src={imgUrl(product.image)}
            alt={product.name}
            className="w-20 h-20 object-cover rounded-lg"
          />
          <div>
            <h2 className="font-bold text-slate-800">{product.name}</h2>
            <p className="text-sm text-slate-500">
              In stock: {product.stock}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Quantity
            </label>
            <input
              type="number"
              min="1"
              max={product.stock}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Price per unit
            </label>
            <input
              type="number"
              min="0"
              value={unitPrice}
              onChange={(e) => setUnitPrice(Number(e.target.value))}
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Payment Method
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Customer Mobile (optional)
            </label>
            <input
              type="tel"
              maxLength={10}
              value={customerMobile}
              onChange={(e) => {
                setCustomerMobile(e.target.value.replace(/\D/g, "").slice(0, 10));
                setCustomerFound(false);
              }}
              onBlur={handleMobileBlur}
              placeholder="10-digit mobile number"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {lookingUp && (
              <p className="text-xs text-slate-400 mt-1">Checking...</p>
            )}
            {customerFound && (
              <p className="text-xs text-green-600 mt-1">
                Existing customer found — loyalty points will be added
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Customer Name (optional)
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Walk-in customer"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting || product.stock === 0}
            className="w-full bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full py-3 transition-colors disabled:opacity-60"
          >
            {product.stock === 0
              ? "Out of Stock"
              : submitting
                ? "Recording Sale..."
                : `Record Sale — ₹${quantity * (unitPrice || 0)}`}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AdminPOS;
