import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { FaPlus } from "react-icons/fa";
import {
  getAddresses,
  deleteAddress,
  setDefaultAddress,
} from "../services/addressService";

function Addresses() {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAddresses = async () => {
    const data = await getAddresses();

    if (data.success) {
      setAddresses(data.addresses);
    } else {
      toast.error(data.message || "Unable to load addresses");
    }

    setLoading(false);
  };

  useEffect(() => {
    loadAddresses();
  }, []);

  const handleRemove = async (id) => {
    const data = await deleteAddress(id);

    if (data.success) {
      toast.success("Address removed");
      loadAddresses();
    } else {
      toast.error(data.message || "Unable to remove address");
    }
  };

  const handleSetDefault = async (id) => {
    const data = await setDefaultAddress(id);

    if (data.success) {
      toast.success("Default address updated");
      loadAddresses();
    } else {
      toast.error(data.message || "Unable to update default address");
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="text-sm mb-2">
        <Link to="/account" className="text-blue-700 hover:underline">
          Your Account
        </Link>
        <span className="text-slate-400 mx-2">›</span>
        <span className="text-amber-600 font-medium">Your Addresses</span>
      </div>

      <h1 className="text-3xl font-bold text-slate-900 mb-6">
        Your Addresses
      </h1>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <Link
            to="/addresses/add"
            className="min-h-[220px] border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-500 hover:border-amber-500 hover:text-amber-600 transition-colors"
          >
            <FaPlus className="text-2xl" />
            <span className="font-semibold">Add Address</span>
          </Link>

          {addresses.map((addr) => (
            <div
              key={addr._id}
              className="border border-slate-200 rounded-xl p-5 bg-white flex flex-col"
            >
              {addr.isDefault && (
                <span className="self-start text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded mb-2">
                  Default
                </span>
              )}

              <p className="font-semibold text-slate-800">{addr.fullName}</p>
              <p className="text-sm text-slate-600 mt-1">
                {addr.address}
                {addr.unit ? `, ${addr.unit}` : ""}
              </p>
              <p className="text-sm text-slate-600">
                {addr.city}, {addr.state} {addr.pincode}
              </p>
              <p className="text-sm text-slate-600">{addr.country}</p>
              <p className="text-sm text-slate-600 mt-1">
                Phone number: {addr.mobile}
              </p>

              <div className="flex items-center gap-3 mt-4 text-sm">
                <Link
                  to={`/addresses/edit/${addr._id}`}
                  className="text-blue-700 hover:underline"
                >
                  Edit
                </Link>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => handleRemove(addr._id)}
                  className="text-blue-700 hover:underline"
                >
                  Remove
                </button>
                {!addr.isDefault && (
                  <>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => handleSetDefault(addr._id)}
                      className="text-blue-700 hover:underline"
                    >
                      Set as Default
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Addresses;
