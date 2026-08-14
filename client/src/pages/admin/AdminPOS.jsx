import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

import {
  getProductForPOS,
  lookupCustomerByMobile,
  recordOfflineSale,
} from "../../services/posService";
import {
  getPosCart,
  addToPosCart,
  updatePosCartQuantity,
  updatePosCartPrice,
  removeFromPosCart,
  clearPosCart,
} from "../../utils/posCart";
import { imgUrl } from "../../services/api";

const PAYMENT_METHODS = ["Cash", "UPI", "Card"];

function AdminPOS() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);

  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [customerMobile, setCustomerMobile] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerFound, setCustomerFound] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [paymentProofFile, setPaymentProofFile] = useState(null);
  const [paymentProofPreview, setPaymentProofPreview] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sale, setSale] = useState(null);

  // Guards against React StrictMode's deliberate double-invoke of
  // effects in development (and any other accidental double-mount) —
  // without this, scanning one QR code could add the same product
  // twice. Keyed by id so scanning a *different* product right after
  // still runs normally.
  const scannedIdRef = useRef(null);

  // Scanning a QR code (i.e. landing here with an :id) adds that
  // product to the cart, then falls through to showing the cart —
  // scanning a second code just adds a second line, same as before.
  useEffect(() => {
    const scanIntoCart = async () => {
      if (id && scannedIdRef.current !== id) {
        scannedIdRef.current = id;
        const response = await getProductForPOS(id);

        if (response.success) {
          if (response.product.stock <= 0) {
            toast.error(`${response.product.name} is out of stock`);
          } else {
            addToPosCart(response.product);
            toast.success(`${response.product.name} added to cart`);
          }
        } else {
          toast.error("Product not found");
        }

        // Drop the :id from the URL so refreshing/back-navigating
        // doesn't re-add the same scan again.
        navigate("/admin/pos", { replace: true });
      }

      setCart(getPosCart());
      setLoading(false);
    };

    scanIntoCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleQuantityChange = (productId, quantity) => {
    setCart(updatePosCartQuantity(productId, quantity));
  };

  const handlePriceChange = (productId, unitPrice) => {
    setCart(updatePosCartPrice(productId, unitPrice));
  };

  const handleRemove = (productId) => {
    setCart(removeFromPosCart(productId));
  };

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

  const cartTotal = cart.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );

  // Clamped the same way the server clamps it, so what the admin sees
  // here matches what actually gets saved — never negative, never more
  // than the cart itself.
  const discountAmount = Math.min(
    Math.max(Number(discountInput) || 0, 0),
    cartTotal,
  );
  const finalAmount = cartTotal - discountAmount;

  const handlePaymentProofChange = (e) => {
    const file = e.target.files?.[0] || null;
    setPaymentProofFile(file);
    setPaymentProofPreview(file ? URL.createObjectURL(file) : "");
  };

  const handleCheckout = async (e) => {
    e.preventDefault();
    setError("");

    if (cart.length === 0) {
      setError("Cart is empty");
      return;
    }

    setSubmitting(true);

    const response = await recordOfflineSale({
      items: cart.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      paymentMethod,
      customerMobile,
      customerName,
      discountAmount,
      paymentProofFile,
    });

    setSubmitting(false);

    if (response.success) {
      clearPosCart();
      setSale(response.sale);
    } else {
      setError(response.message || "Unable to record sale");
    }
  };

  const whatsappLink = () => {
    const lines = [
      "Mittal Collections - Bill Receipt",
      ...sale.items.map(
        (i) => `${i.productName}: ${i.quantity} x ₹${i.unitPrice} = ₹${i.subtotal}`,
      ),
      ...(sale.discountAmount > 0 ? [`Discount: -₹${sale.discountAmount}`] : []),
      `Total: ₹${sale.totalAmount}`,
      `Payment: ${sale.paymentMethod}`,
      `Date: ${new Date(sale.createdAt).toLocaleString("en-IN")}`,
      "",
      "Thank you for shopping with us!",
    ];

    return `https://wa.me/91${sale.customerMobile}?text=${encodeURIComponent(lines.join("\n"))}`;
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
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

          <div className="border-t border-b border-slate-100 py-4 mb-4 text-sm space-y-1">
            {sale.items.map((item) => (
              <div key={item.product} className="flex justify-between">
                <span>{item.productName}</span>
                <span>
                  {item.quantity} × ₹{item.unitPrice} = ₹{item.subtotal}
                </span>
              </div>
            ))}

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

          {sale.discountAmount > 0 && (
            <div className="flex justify-between text-sm text-green-600 mb-1">
              <span>Discount</span>
              <span>−₹{sale.discountAmount}</span>
            </div>
          )}

          <div className="flex justify-between text-lg font-bold text-slate-900 mb-4">
            <span>Total</span>
            <span>₹{sale.totalAmount}</span>
          </div>

          {sale.paymentProofImage && (
            <div className="mb-6">
              <p className="text-xs text-slate-400 mb-1">Payment Proof</p>
              <img
                src={sale.paymentProofImage}
                alt="Payment proof"
                className="w-full max-h-64 object-contain rounded-lg border border-slate-200"
              />
            </div>
          )}

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

            <button
              onClick={() => {
                setSale(null);
                setCustomerMobile("");
                setCustomerName("");
                setCustomerFound(false);
                setCart([]);
                setDiscountInput("");
                setPaymentProofFile(null);
                setPaymentProofPreview("");
              }}
              className="border-2 border-blue-900 text-blue-900 font-semibold rounded-full py-3 transition-colors"
            >
              New Sale
            </button>

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

  // ===== Cart + checkout view =====
  return (
    <div className="p-6 max-w-lg mx-auto">
      <h2 className="text-xl font-bold text-slate-800 mb-4">POS Cart</h2>

      {cart.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
          Cart is empty. Scan a product's QR code to add it here.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5 space-y-4">
          {cart.map((item) => (
            <div
              key={item.productId}
              className="flex items-center gap-3 border-b border-slate-100 pb-4 last:border-0 last:pb-0"
            >
              <img
                src={imgUrl(item.image)}
                alt={item.name}
                className="w-14 h-14 object-cover rounded-lg shrink-0"
              />

              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-800 truncate">
                  {item.name}
                </p>

                <div className="flex items-center gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() =>
                      handleQuantityChange(item.productId, item.quantity - 1)
                    }
                    className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleQuantityChange(item.productId, item.quantity + 1)
                    }
                    className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                  >
                    +
                  </button>

                  <span className="text-slate-400 mx-1">×</span>
                  <input
                    type="number"
                    min="0"
                    value={item.unitPrice}
                    onChange={(e) =>
                      handlePriceChange(item.productId, Number(e.target.value))
                    }
                    className="w-20 border border-slate-300 rounded px-1.5 py-0.5 text-sm"
                  />
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className="font-semibold text-slate-800">
                  ₹{item.quantity * item.unitPrice}
                </p>
                <button
                  type="button"
                  onClick={() => handleRemove(item.productId)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}

          <div className="pt-2 border-t border-slate-200 space-y-1">
            <div className="flex justify-between text-slate-600 text-sm">
              <span>Subtotal</span>
              <span>₹{cartTotal}</span>
            </div>

            {discountAmount > 0 && (
              <div className="flex justify-between text-green-600 text-sm">
                <span>Discount</span>
                <span>−₹{discountAmount}</span>
              </div>
            )}

            <div className="flex justify-between font-bold text-slate-900">
              <span>Total</span>
              <span>₹{finalAmount}</span>
            </div>
          </div>
        </div>
      )}

      {cart.length > 0 && (
        <form
          onSubmit={handleCheckout}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
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
              Discount Amount (optional)
            </label>
            <input
              type="number"
              min="0"
              max={cartTotal}
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
              placeholder="0"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {paymentMethod !== "Cash" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Payment Proof (optional)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handlePaymentProofChange}
                className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:text-sm file:font-medium hover:file:bg-blue-100"
              />
              {paymentProofPreview && (
                <img
                  src={paymentProofPreview}
                  alt="Payment proof preview"
                  className="mt-2 h-24 rounded-lg border border-slate-200 object-cover"
                />
              )}
            </div>
          )}

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
            disabled={submitting}
            className="w-full bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full py-3 transition-colors disabled:opacity-60"
          >
            {submitting ? "Recording Sale..." : `Complete Sale — ₹${finalAmount}`}
          </button>
        </form>
      )}

      <p className="text-center text-sm text-slate-400 mt-4">
        Scan another product's QR code to add it to this same cart.
      </p>
    </div>
  );
}

export default AdminPOS;
