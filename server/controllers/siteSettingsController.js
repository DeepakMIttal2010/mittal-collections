import SiteSettings from "../models/SiteSettings.js";

// ============================
// GET SITE SETTINGS (Public)
// ============================
export const getSiteSettings = async (req, res) => {
  try {
    let settings = await SiteSettings.findOne();

    if (!settings) {
      settings = await SiteSettings.create({});
    }

    res.status(200).json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error("Get Site Settings Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// UPDATE SITE SETTINGS (Admin)
// ============================
export const updateSiteSettings = async (req, res) => {
  try {
    const {
      facebook,
      instagram,
      twitter,
      linkedin,
      address,
      email,
      phone,
      supportHours,
      freeShippingThreshold,
      deliveryFee,
      shippingTiers,
      defaultReturnPeriodDays,
    } = req.body;

    let settings = await SiteSettings.findOne();

    if (!settings) {
      settings = new SiteSettings();
    }

    if (facebook !== undefined) settings.facebook = facebook;
    if (instagram !== undefined) settings.instagram = instagram;
    if (twitter !== undefined) settings.twitter = twitter;
    if (linkedin !== undefined) settings.linkedin = linkedin;
    if (address !== undefined) settings.address = address;
    if (email !== undefined) settings.email = email;
    if (phone !== undefined) settings.phone = phone;
    if (supportHours !== undefined) settings.supportHours = supportHours;
    if (freeShippingThreshold !== undefined)
      settings.freeShippingThreshold = freeShippingThreshold;
    if (deliveryFee !== undefined) settings.deliveryFee = deliveryFee;
    if (shippingTiers !== undefined) settings.shippingTiers = shippingTiers;
    if (defaultReturnPeriodDays !== undefined)
      settings.defaultReturnPeriodDays = defaultReturnPeriodDays;

    await settings.save();

    res.status(200).json({
      success: true,
      message: "Settings updated successfully",
      settings,
    });
  } catch (error) {
    console.error("Update Site Settings Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
