import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { getAllProducts } from "../../services/adminProductService";

function PrintLabels() {
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadLabels = async () => {
      const response = await getAllProducts({ limit: 1000 });

      if (!response.success) {
        setLoading(false);
        return;
      }

      const generated = await Promise.all(
        response.products.map(async (product) => {
          const url = `${window.location.origin}/admin/pos/${product._id}`;
          const qrDataUrl = await QRCode.toDataURL(url, { width: 220 });

          return {
            id: product._id,
            name: product.name,
            price: product.price,
            oldPrice: product.oldPrice,
            qrDataUrl,
          };
        }),
      );

      setLabels(generated);
      setLoading(false);
    };

    loadLabels();
  }, []);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            Print Product Labels
          </h2>
          <p className="text-sm text-slate-500">
            Each QR code opens the in-store sale page for that product when
            scanned. Print, cut, and stick on the product.
          </p>
        </div>

        <button
          onClick={() => window.print()}
          className="bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-6 py-2.5 transition-colors"
        >
          Print
        </button>
      </div>

      {loading ? (
        <p className="text-slate-500">Generating labels...</p>
      ) : labels.length === 0 ? (
        <p className="text-slate-500">No products found.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 print:grid-cols-3">
          {labels.map((label) => (
            <div
              key={label.id}
              className="border border-slate-300 rounded-lg p-3 text-center break-inside-avoid"
            >
              <img
                src={label.qrDataUrl}
                alt={`QR code for ${label.name}`}
                className="mx-auto w-full max-w-[160px]"
              />
              <p className="text-sm font-semibold text-slate-800 mt-2 truncate">
                {label.name}
              </p>
              <p className="text-xs">
                {label.oldPrice > label.price && (
                  <span className="text-slate-400 line-through mr-1">
                    ₹{label.oldPrice}
                  </span>
                )}
                <span className="font-semibold text-slate-700">
                  ₹{label.price}
                </span>
              </p>
              <p className="text-[10px] text-slate-400 font-mono truncate">
                ID: {label.id}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PrintLabels;
