import { DELIVERY_AREAS } from "../utils/deliveryAreas.js";

// India Post's own pincode lookup — free, keyless, no rate limit info
// published but used here for a single on-demand check per customer
// click, not bulk lookups. Has no CORS headers (confirmed directly),
// hence this server-side proxy rather than calling it from the browser.
const PINCODE_API = "https://api.postalpincode.in/pincode";

// Shared by the public checkPincode endpoint below AND orderController's
// server-side localDeliveryOnly enforcement (createOrder must not trust
// only the client-side pincode-checker UI, which a direct API call can
// bypass entirely). Validates its own input rather than trusting every
// caller to do it first — checkPincode's req.params.pincode was always
// validated before this existed, but createOrder's req.body.shippingAddress
// .pincode is arbitrary client input with no such guarantee, and this is
// the one place it flows into an outgoing fetch() URL.
export const resolveFastDelivery = async (pincode) => {
  if (!/^\d{6}$/.test(pincode || "")) {
    return { found: false };
  }

  const response = await fetch(`${PINCODE_API}/${pincode}`, {
    signal: AbortSignal.timeout(4000),
  });
  const data = await response.json();
  const result = data?.[0];

  if (result?.Status !== "Success" || !result.PostOffice?.length) {
    return { found: false };
  }

  const district = result.PostOffice[0].District;

  // Case-insensitive since the API's own spelling can differ slightly
  // from ours (e.g. "Vasundhra" vs our "Vasundhara").
  const matchedArea = result.PostOffice.find((po) =>
    DELIVERY_AREAS.some((area) => area.toLowerCase() === po.Name.toLowerCase()),
  );

  return {
    found: true,
    fastDelivery: Boolean(matchedArea) || district === "Ghaziabad",
    areaName: matchedArea?.Name || result.PostOffice[0].Name,
    district,
  };
};

// ============================
// Check Pincode Delivery (Public)
// ============================
export const checkPincode = async (req, res) => {
  try {
    const { pincode } = req.params;

    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid 6-digit pincode",
      });
    }

    const result = await resolveFastDelivery(pincode);

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("Check Pincode Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
