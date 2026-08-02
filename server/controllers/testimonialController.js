import Testimonial from "../models/Testimonial.js";

// ============================
// GET ACTIVE TESTIMONIALS (Public)
// ============================
export const getTestimonials = async (req, res) => {
  try {
    const testimonials = await Testimonial.find({ isActive: true }).sort({
      displayOrder: 1,
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      testimonials,
    });
  } catch (error) {
    console.error("Get Testimonials Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// GET ALL TESTIMONIALS (Admin)
// ============================
export const getAllTestimonialsAdmin = async (req, res) => {
  try {
    const allowedSortFields = ["displayOrder", "name", "rating", "createdAt"];
    const sortBy = allowedSortFields.includes(req.query.sortBy)
      ? req.query.sortBy
      : "displayOrder";
    const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;

    const sortSpec =
      sortBy === "displayOrder"
        ? { displayOrder: sortOrder, createdAt: -1 }
        : { [sortBy]: sortOrder };

    const testimonials = await Testimonial.find().sort(sortSpec);

    res.status(200).json({
      success: true,
      testimonials,
    });
  } catch (error) {
    console.error("Get Testimonials Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// ADD TESTIMONIAL (Admin)
// ============================
export const addTestimonial = async (req, res) => {
  try {
    const { name, city, rating, review, displayOrder, isActive } = req.body;

    if (!name || !city || !review) {
      return res.status(400).json({
        success: false,
        message: "Name, city and review are required",
      });
    }

    const testimonial = await Testimonial.create({
      name,
      city,
      rating: rating || 5,
      review,
      displayOrder: displayOrder || 0,
      isActive: isActive === undefined ? true : isActive,
    });

    res.status(201).json({
      success: true,
      message: "Testimonial added successfully",
      testimonial,
    });
  } catch (error) {
    console.error("Add Testimonial Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// UPDATE TESTIMONIAL (Admin)
// ============================
export const updateTestimonial = async (req, res) => {
  try {
    const testimonial = await Testimonial.findById(req.params.id);

    if (!testimonial) {
      return res.status(404).json({
        success: false,
        message: "Testimonial not found",
      });
    }

    const { name, city, rating, review, displayOrder, isActive } = req.body;

    if (name) testimonial.name = name;
    if (city) testimonial.city = city;
    if (rating !== undefined) testimonial.rating = rating;
    if (review) testimonial.review = review;
    if (displayOrder !== undefined) testimonial.displayOrder = displayOrder;
    if (isActive !== undefined) testimonial.isActive = isActive;

    await testimonial.save();

    res.status(200).json({
      success: true,
      message: "Testimonial updated successfully",
      testimonial,
    });
  } catch (error) {
    console.error("Update Testimonial Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// DELETE TESTIMONIAL (Admin)
// ============================
export const deleteTestimonial = async (req, res) => {
  try {
    const testimonial = await Testimonial.findById(req.params.id);

    if (!testimonial) {
      return res.status(404).json({
        success: false,
        message: "Testimonial not found",
      });
    }

    await testimonial.deleteOne();

    res.status(200).json({
      success: true,
      message: "Testimonial deleted successfully",
    });
  } catch (error) {
    console.error("Delete Testimonial Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
