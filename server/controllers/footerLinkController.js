import FooterLink from "../models/FooterLink.js";

// ============================
// GET ACTIVE FOOTER LINKS (Public)
// ============================
export const getFooterLinks = async (req, res) => {
  try {
    const links = await FooterLink.find({ isActive: true }).sort({
      displayOrder: 1,
      createdAt: 1,
    });

    res.status(200).json({
      success: true,
      links,
    });
  } catch (error) {
    console.error("Get Footer Links Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// GET ALL FOOTER LINKS (Admin)
// ============================
export const getAllFooterLinksAdmin = async (req, res) => {
  try {
    const allowedSortFields = ["displayOrder", "label", "createdAt"];
    const sortBy = allowedSortFields.includes(req.query.sortBy)
      ? req.query.sortBy
      : "displayOrder";
    const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;

    const sortSpec =
      sortBy === "displayOrder"
        ? { displayOrder: sortOrder, createdAt: 1 }
        : { [sortBy]: sortOrder };

    const links = await FooterLink.find().sort(sortSpec);

    res.status(200).json({
      success: true,
      links,
    });
  } catch (error) {
    console.error("Get Footer Links Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// CREATE FOOTER LINK (Admin)
// ============================
export const createFooterLink = async (req, res) => {
  try {
    const { label, labelHi, url, displayOrder, isActive } = req.body;

    if (!label || !url) {
      return res.status(400).json({
        success: false,
        message: "Label and URL are required",
      });
    }

    const link = await FooterLink.create({
      label,
      labelHi: labelHi || "",
      url,
      displayOrder: displayOrder || 0,
      isActive: isActive !== undefined ? isActive : true,
    });

    res.status(201).json({
      success: true,
      message: "Footer link created successfully",
      link,
    });
  } catch (error) {
    console.error("Create Footer Link Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// UPDATE FOOTER LINK (Admin)
// ============================
export const updateFooterLink = async (req, res) => {
  try {
    const link = await FooterLink.findById(req.params.id);

    if (!link) {
      return res.status(404).json({
        success: false,
        message: "Footer link not found",
      });
    }

    const { label, labelHi, url, displayOrder, isActive } = req.body;

    if (label !== undefined) link.label = label;
    if (labelHi !== undefined) link.labelHi = labelHi;
    if (url !== undefined) link.url = url;
    if (displayOrder !== undefined) link.displayOrder = displayOrder;
    if (isActive !== undefined) link.isActive = isActive;

    await link.save();

    res.status(200).json({
      success: true,
      message: "Footer link updated successfully",
      link,
    });
  } catch (error) {
    console.error("Update Footer Link Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// DELETE FOOTER LINK (Admin)
// ============================
export const deleteFooterLink = async (req, res) => {
  try {
    const link = await FooterLink.findByIdAndDelete(req.params.id);

    if (!link) {
      return res.status(404).json({
        success: false,
        message: "Footer link not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Footer link deleted successfully",
    });
  } catch (error) {
    console.error("Delete Footer Link Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
