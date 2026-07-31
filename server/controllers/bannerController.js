import Banner from "../models/Banner.js";

// ============================
// GET ACTIVE BANNERS (Public)
// ============================
export const getBanners = async (req, res) => {
  try {
    const banners = await Banner.find({ isActive: true }).sort({
      displayOrder: 1,
      createdAt: 1,
    });

    res.status(200).json({
      success: true,
      banners,
    });
  } catch (error) {
    console.error("Get Banners Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// GET ALL BANNERS (Admin)
// ============================
export const getAllBannersAdmin = async (req, res) => {
  try {
    const banners = await Banner.find().sort({
      displayOrder: 1,
      createdAt: 1,
    });

    res.status(200).json({
      success: true,
      banners,
    });
  } catch (error) {
    console.error("Get Banners Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// ADD BANNER (Admin)
// ============================
export const addBanner = async (req, res) => {
  try {
    const {
      subtitle,
      title,
      description,
      button1Label,
      button1Link,
      button2Label,
      button2Link,
      displayOrder,
      isActive,
    } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Banner image is required",
      });
    }

    if (!title) {
      return res.status(400).json({
        success: false,
        message: "Title is required",
      });
    }

    const banner = await Banner.create({
      image: req.file.path,
      subtitle,
      title,
      description,
      button1Label,
      button1Link,
      button2Label,
      button2Link,
      displayOrder: displayOrder || 0,
      isActive: isActive === undefined ? true : isActive === "true",
    });

    res.status(201).json({
      success: true,
      message: "Banner added successfully",
      banner,
    });
  } catch (error) {
    console.error("Add Banner Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// UPDATE BANNER (Admin)
// ============================
export const updateBanner = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Banner not found",
      });
    }

    const {
      subtitle,
      title,
      description,
      button1Label,
      button1Link,
      button2Label,
      button2Link,
      displayOrder,
      isActive,
    } = req.body;

    if (title !== undefined) banner.title = title;
    if (subtitle !== undefined) banner.subtitle = subtitle;
    if (description !== undefined) banner.description = description;
    if (button1Label !== undefined) banner.button1Label = button1Label;
    if (button1Link !== undefined) banner.button1Link = button1Link;
    if (button2Label !== undefined) banner.button2Label = button2Label;
    if (button2Link !== undefined) banner.button2Link = button2Link;
    if (displayOrder !== undefined) banner.displayOrder = displayOrder;
    if (isActive !== undefined) banner.isActive = isActive === "true";

    if (req.file) {
      banner.image = req.file.path;
    }

    await banner.save();

    res.status(200).json({
      success: true,
      message: "Banner updated successfully",
      banner,
    });
  } catch (error) {
    console.error("Update Banner Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// RESTORE BANNER (Admin)
// ============================
export const restoreBanner = async (req, res) => {
  try {
    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true },
    );

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Banner not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Banner restored successfully",
      banner,
    });
  } catch (error) {
    console.error("Restore Banner Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// DELETE BANNER (Admin)
// ============================
export const deleteBanner = async (req, res) => {
  try {
    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true },
    );

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Banner not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Banner deleted successfully",
    });
  } catch (error) {
    console.error("Delete Banner Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
