import Wishlist from "../models/Wishlist.js";

// GET /api/wishlist
export const getWishlist = async (req, res) => {
  try {
    const wishlist = await Wishlist.find({ user: req.user._id }).populate({
      path: "product",
      populate: {
        path: "category",
        select: "name slug",
      },
    });

    res.status(200).json({
      success: true,
      wishlist,
    });
  } catch (error) {
    console.error("Get Wishlist Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// POST /api/wishlist
export const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;

    const exists = await Wishlist.findOne({
      user: req.user.id,
      product: productId,
    });

    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Product already in wishlist",
      });
    }

    const wishlistItem = await Wishlist.create({
      user: req.user.id,
      product: productId,
    });

    res.status(201).json({
      success: true,
      wishlistItem,
    });
  } catch (error) {
    console.error("Add Wishlist Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// DELETE /api/wishlist/:productId
export const removeFromWishlist = async (req, res) => {
  try {
    const item = await Wishlist.findOneAndDelete({
      user: req.user.id,
      product: req.params.productId,
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Wishlist item not found",
      });
    }

    res.set("Cache-Control", "no-store");

    res.status(200).json({
      success: true,
      message: "Removed from wishlist",
    });
  } catch (error) {
    console.error("Remove Wishlist Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

export const clearWishlist = async (req, res) => {
  try {
    await Wishlist.deleteMany({
      user: req.user._id,
    });

    res.status(200).json({
      success: true,
      message: "Wishlist cleared successfully",
    });
  } catch (error) {
    console.error("Clear Wishlist Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
