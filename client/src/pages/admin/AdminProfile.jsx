import { useEffect, useState } from "react";

import { getProfile, updateProfile } from "../../services/adminProfileService";

const MOBILE_REGEX = /^[6-9]\d{9}$/;

function AdminProfile() {
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [mobileError, setMobileError] = useState("");

  const [profileData, setProfileData] = useState({
    name: "",
    email: "",
    mobile: "",
    role: "",
  });

  const loadProfile = async () => {
    setLoading(true);

    const response = await getProfile();

    if (response.success) {
      setProfileData({
        name: response.user.name,
        email: response.user.email,
        mobile: response.user.mobile,
        role: response.user.role,
      });
    }

    setLoading(false);
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleProfileChange = (e) => {
    const { name, value } = e.target;

    if (name === "mobile") {
      const digitsOnly = value.replace(/\D/g, "").slice(0, 10);

      setProfileData((prev) => ({ ...prev, mobile: digitsOnly }));

      setMobileError(
        digitsOnly && !MOBILE_REGEX.test(digitsOnly)
          ? "Enter a valid 10-digit mobile number"
          : "",
      );

      return;
    }

    setProfileData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();

    if (!MOBILE_REGEX.test(profileData.mobile)) {
      setMobileError("Enter a valid 10-digit mobile number");
      return;
    }

    setSavingProfile(true);

    const response = await updateProfile({
      name: profileData.name,
      mobile: profileData.mobile,
    });

    setSavingProfile(false);

    if (response.success) {
      alert("Profile updated successfully");

      const storedUser = localStorage.getItem("user");

      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);

        localStorage.setItem(
          "user",
          JSON.stringify({ ...parsedUser, ...response.user }),
        );
      }
    } else {
      alert(response.message || "Unable to update profile");
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">Loading Profile...</div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">My Profile</h2>

      <div className="max-w-lg">
        {/* Profile Info Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">
            Profile Information
          </h3>

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Name
              </label>
              <input
                type="text"
                name="name"
                value={profileData.name}
                onChange={handleProfileChange}
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={profileData.email}
                disabled
                className="w-full border border-slate-200 bg-slate-50 text-slate-500 rounded-lg px-3 py-2 cursor-not-allowed"
              />
              <p className="text-xs text-slate-400 mt-1">
                Email cannot be changed
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Mobile
              </label>
              <input
                type="tel"
                inputMode="numeric"
                name="mobile"
                value={profileData.mobile}
                onChange={handleProfileChange}
                required
                maxLength={10}
                className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 ${
                  mobileError
                    ? "border-red-400 focus:ring-red-400"
                    : "border-slate-300 focus:ring-blue-500"
                }`}
              />
              {mobileError && (
                <p className="text-xs text-red-500 mt-1">{mobileError}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Role
              </label>
              <input
                type="text"
                value={profileData.role}
                disabled
                className="w-full border border-slate-200 bg-slate-50 text-slate-500 rounded-lg px-3 py-2 cursor-not-allowed capitalize"
              />
            </div>

            <button
              type="submit"
              disabled={savingProfile || !!mobileError}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-60"
            >
              {savingProfile ? "Saving..." : "Save Changes"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default AdminProfile;
