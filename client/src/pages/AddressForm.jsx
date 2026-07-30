import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import {
  getAddresses,
  addAddress,
  updateAddress,
} from "../services/addressService";
import { getStates } from "../services/stateService";

function AddressForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/addresses";
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [states, setStates] = useState([]);

  const [formData, setFormData] = useState({
    fullName: "",
    mobile: "",
    address: "",
    unit: "",
    city: "",
    state: "",
    pincode: "",
    isDefault: false,
  });

  useEffect(() => {
    const loadStates = async () => {
      const data = await getStates();
      setStates(data.states);
    };

    loadStates();
  }, []);

  useEffect(() => {
    if (!isEdit) return;

    const loadAddress = async () => {
      const data = await getAddresses();

      const existing = data.addresses?.find((a) => a._id === id);

      if (existing) {
        setFormData({
          fullName: existing.fullName || "",
          mobile: existing.mobile || "",
          address: existing.address || "",
          unit: existing.unit || "",
          city: existing.city || "",
          state: existing.state || "",
          pincode: existing.pincode || "",
          isDefault: existing.isDefault || false,
        });
      } else {
        toast.error("Address not found");
        navigate("/addresses");
      }

      setLoading(false);
    };

    loadAddress();
  }, [id, isEdit, navigate]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSaving(true);
    const data = isEdit
      ? await updateAddress(id, formData)
      : await addAddress(formData);
    setSaving(false);

    if (data.success) {
      toast.success(isEdit ? "Address updated" : "Address added");
      navigate(redirectTo);
    } else {
      toast.error(data.message || "Unable to save address");
    }
  };

  const inputClass =
    "w-full bg-slate-100 rounded-lg px-5 py-3.5 outline-none text-sm text-slate-800 placeholder:text-slate-500";

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="text-sm mb-2">
        <Link to="/account" className="text-blue-700 hover:underline">
          Your Account
        </Link>
        <span className="text-slate-400 mx-2">›</span>
        <Link to="/addresses" className="text-blue-700 hover:underline">
          Your Addresses
        </Link>
        <span className="text-slate-400 mx-2">›</span>
        <span className="text-amber-600 font-medium">
          {isEdit ? "Edit Address" : "New Address"}
        </span>
      </div>

      <h1 className="text-3xl font-bold text-slate-900 mb-6">
        {isEdit ? "Edit address" : "Add a new address"}
      </h1>

      <form onSubmit={handleSubmit} className="max-w-md space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-1">
            Full name (First and Last name)
          </label>
          <input
            type="text"
            name="fullName"
            value={formData.fullName}
            onChange={handleChange}
            required
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-1">
            Phone number
          </label>
          <input
            type="tel"
            name="mobile"
            value={formData.mobile}
            onChange={handleChange}
            maxLength={10}
            pattern="[0-9]{10}"
            required
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-1">
            Street address
          </label>
          <input
            type="text"
            name="address"
            placeholder="Street address or P.O. Box"
            value={formData.address}
            onChange={handleChange}
            required
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-1">
            Unit or suite number
          </label>
          <input
            type="text"
            name="unit"
            placeholder="Apt, suite, unit, building, floor, etc."
            value={formData.unit}
            onChange={handleChange}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1">
              City
            </label>
            <input
              type="text"
              name="city"
              value={formData.city}
              onChange={handleChange}
              required
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1">
              State
            </label>
            <select
              name="state"
              value={formData.state}
              onChange={handleChange}
              required
              className={inputClass}
            >
              <option value="">Select</option>
              {states.map((state) => (
                <option key={state._id} value={state.name}>
                  {state.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1">
              ZIP Code
            </label>
            <input
              type="text"
              name="pincode"
              value={formData.pincode}
              onChange={handleChange}
              maxLength={6}
              pattern="[0-9]{6}"
              required
              className={inputClass}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            name="isDefault"
            checked={formData.isDefault}
            onChange={handleChange}
            className="w-4 h-4 accent-blue-900"
          />
          Make this my default address
        </label>

        <button
          type="submit"
          disabled={saving}
          className="bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-full px-8 py-3.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : isEdit ? "Save address" : "Add address"}
        </button>
      </form>
    </div>
  );
}

export default AddressForm;
