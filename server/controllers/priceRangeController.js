import PriceRange from "../models/PriceRange.js";

// ============================
// GET ACTIVE PRICE RANGES (Public)
// ============================
export const getPriceRanges = async (req, res) => {
  try {
    const priceRanges = await PriceRange.find({ isActive: true }).sort({
      displayOrder: 1,
      maxPrice: 1,
    });

    res.status(200).json({
      success: true,
      priceRanges,
    });
  } catch (error) {
    console.error("Get Price Ranges Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// GET ALL PRICE RANGES (Admin)
// ============================
export const getAllPriceRangesAdmin = async (req, res) => {
  try {
    const priceRanges = await PriceRange.find().sort({
      displayOrder: 1,
      maxPrice: 1,
    });

    res.status(200).json({
      success: true,
      priceRanges,
    });
  } catch (error) {
    console.error("Get Price Ranges Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// ADD PRICE RANGE (Admin)
// ============================
export const addPriceRange = async (req, res) => {
  try {
    const { label, maxPrice, displayOrder, isActive } = req.body;

    if (!label || maxPrice === undefined) {
      return res.status(400).json({
        success: false,
        message: "Label and max price are required",
      });
    }

    const priceRange = await PriceRange.create({
      label,
      maxPrice,
      displayOrder: displayOrder || 0,
      isActive: isActive === undefined ? true : isActive,
    });

    res.status(201).json({
      success: true,
      message: "Price range added successfully",
      priceRange,
    });
  } catch (error) {
    console.error("Add Price Range Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// UPDATE PRICE RANGE (Admin)
// ============================
export const updatePriceRange = async (req, res) => {
  try {
    const priceRange = await PriceRange.findById(req.params.id);

    if (!priceRange) {
      return res.status(404).json({
        success: false,
        message: "Price range not found",
      });
    }

    const { label, maxPrice, displayOrder, isActive } = req.body;

    if (label !== undefined) priceRange.label = label;
    if (maxPrice !== undefined) priceRange.maxPrice = maxPrice;
    if (displayOrder !== undefined) priceRange.displayOrder = displayOrder;
    if (isActive !== undefined) priceRange.isActive = isActive;

    await priceRange.save();

    res.status(200).json({
      success: true,
      message: "Price range updated successfully",
      priceRange,
    });
  } catch (error) {
    console.error("Update Price Range Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// RESTORE PRICE RANGE (Admin)
// ============================
export const restorePriceRange = async (req, res) => {
  try {
    const priceRange = await PriceRange.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true },
    );

    if (!priceRange) {
      return res.status(404).json({
        success: false,
        message: "Price range not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Price range restored successfully",
      priceRange,
    });
  } catch (error) {
    console.error("Restore Price Range Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// DELETE PRICE RANGE (Admin)
// ============================
export const deletePriceRange = async (req, res) => {
  try {
    const priceRange = await PriceRange.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true },
    );

    if (!priceRange) {
      return res.status(404).json({
        success: false,
        message: "Price range not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Price range deleted successfully",
    });
  } catch (error) {
    console.error("Delete Price Range Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
