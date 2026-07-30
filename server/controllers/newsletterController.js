import Subscriber from "../models/Subscriber.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ============================
// SUBSCRIBE TO NEWSLETTER
// ============================
export const subscribe = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await Subscriber.findOne({ email: normalizedEmail });

    if (existing) {
      return res.status(200).json({
        success: true,
        message: "You're already subscribed",
      });
    }

    await Subscriber.create({ email: normalizedEmail });

    res.status(201).json({
      success: true,
      message: "Subscribed successfully",
    });
  } catch (error) {
    console.error("Newsletter Subscribe Error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to subscribe. Please try again.",
    });
  }
};
