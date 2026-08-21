import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import QRCode from "qrcode";

import { getProductByIdAdmin } from "../../services/adminProductService";
import { imgUrl } from "../../services/api";

function ProductQRLabel() {
  const { id } = useParams();

  const [product, setProduct] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const response = await getProductByIdAdmin(id);

      if (response.success) {
        setProduct(response.product);

        const url = `${window.location.origin}/admin/pos/${id}`;
        const dataUrl = await QRCode.toDataURL(url, { width: 400 });
        setQrDataUrl(dataUrl);
      }

      setLoading(false);
    };

    load();
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
  }

  if (!product) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500 mb-4">Product not found.</p>
        <Link to="/admin/products" className="text-blue-700 hover:underline">
          ← Back to Products
        </Link>
      </div>
    );
  }

  const hasDiscount = product.oldPrice && product.oldPrice > product.price;

  return (
    <div className="p-6 max-w-sm mx-auto">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link
          to={`/admin/products/edit/${id}`}
          className="text-sm text-blue-700 hover:underline"
        >
          ← Back to Edit Product
        </Link>
        <button
          onClick={() => window.print()}
          className="bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-5 py-2 text-sm transition-colors"
        >
          Print
        </button>
      </div>

      <div className="border border-slate-300 rounded-lg p-6 text-center">
        {product.image && (
          <img
            src={imgUrl(product.image, "w_150,q_auto,f_auto")}
            alt={product.name}
            className="mx-auto w-16 h-16 object-cover rounded-md border border-slate-200 mb-3"
          />
        )}
        <img
          src={qrDataUrl}
          alt={`QR code for ${product.name}`}
          className="mx-auto w-full max-w-[260px]"
        />
        <p className="font-semibold text-slate-800 mt-3">{product.name}</p>
        {product.category?.name && (
          <p className="text-xs text-slate-500 mt-0.5">
            {product.category.name}
          </p>
        )}
        <p className="mt-1">
          {hasDiscount && (
            <span className="text-slate-400 line-through mr-2">
              ₹{product.oldPrice}
            </span>
          )}
          <span className="text-lg font-bold text-slate-900">
            ₹{product.price}
          </span>
        </p>
        <p className="text-[11px] text-slate-400 font-mono mt-1">
          ID: {product._id}
        </p>
        {product.productNumber && (
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">
            No: {product.productNumber}
          </p>
        )}
      </div>
    </div>
  );
}

export default ProductQRLabel;
