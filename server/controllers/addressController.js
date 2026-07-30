import Address from "../models/Address.js";

// ============================
// GET MY ADDRESSES
// ============================
export const getAddresses = async (req, res) => {
  try {
    const addresses = await Address.find({ user: req.user.id }).sort({
      isDefault: -1,
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      addresses,
    });
  } catch (error) {
    console.error("Get Addresses Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// ADD ADDRESS
// ============================
export const addAddress = async (req, res) => {
  try {
    const {
      fullName,
      mobile,
      address,
      unit,
      city,
      state,
      pincode,
      isDefault,
    } = req.body;

    if (!fullName || !mobile || !address || !city || !state || !pincode) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be filled",
      });
    }

    if (isDefault) {
      await Address.updateMany({ user: req.user.id }, { isDefault: false });
    }

    const existingCount = await Address.countDocuments({ user: req.user.id });

    const newAddress = await Address.create({
      user: req.user.id,
      fullName,
      mobile,
      address,
      unit,
      city,
      state,
      pincode,
      isDefault: isDefault || existingCount === 0,
    });

    res.status(201).json({
      success: true,
      message: "Address added successfully",
      address: newAddress,
    });
  } catch (error) {
    console.error("Add Address Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// UPDATE ADDRESS
// ============================
export const updateAddress = async (req, res) => {
  try {
    const existing = await Address.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }

    const { fullName, mobile, address, unit, city, state, pincode, isDefault } =
      req.body;

    if (isDefault) {
      await Address.updateMany({ user: req.user.id }, { isDefault: false });
    }

    existing.fullName = fullName ?? existing.fullName;
    existing.mobile = mobile ?? existing.mobile;
    existing.address = address ?? existing.address;
    existing.unit = unit ?? existing.unit;
    existing.city = city ?? existing.city;
    existing.state = state ?? existing.state;
    existing.pincode = pincode ?? existing.pincode;
    if (isDefault !== undefined) existing.isDefault = isDefault;

    await existing.save();

    res.status(200).json({
      success: true,
      message: "Address updated successfully",
      address: existing,
    });
  } catch (error) {
    console.error("Update Address Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// DELETE ADDRESS
// ============================
export const deleteAddress = async (req, res) => {
  try {
    const existing = await Address.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }

    const wasDefault = existing.isDefault;

    await existing.deleteOne();

    if (wasDefault) {
      const another = await Address.findOne({ user: req.user.id }).sort({
        createdAt: -1,
      });

      if (another) {
        another.isDefault = true;
        await another.save();
      }
    }

    res.status(200).json({
      success: true,
      message: "Address removed successfully",
    });
  } catch (error) {
    console.error("Delete Address Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// SET DEFAULT ADDRESS
// ============================
export const setDefaultAddress = async (req, res) => {
  try {
    const existing = await Address.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }

    await Address.updateMany({ user: req.user.id }, { isDefault: false });

    existing.isDefault = true;
    await existing.save();

    res.status(200).json({
      success: true,
      message: "Default address updated",
    });
  } catch (error) {
    console.error("Set Default Address Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
