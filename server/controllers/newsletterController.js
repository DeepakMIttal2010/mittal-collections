import Subscriber from "../models/Subscriber.js";
import { sendEmail } from "../config/mailer.js";

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

// ============================
// GET ALL SUBSCRIBERS (Admin)
// ============================
export const getSubscribers = async (req, res) => {
  try {
    const subscribers = await Subscriber.find({}).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      subscribers,
      total: subscribers.length,
    });
  } catch (error) {
    console.error("Get Subscribers Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// SEND NEWSLETTER CAMPAIGN (Admin)
// Emails every subscriber one by one. Failures are collected and
// reported back rather than aborting the whole send.
// ============================
export const sendCampaign = async (req, res) => {
  try {
    const { subject, html } = req.body;

    if (!subject || !html) {
      return res.status(400).json({
        success: false,
        message: "Subject and content are required",
      });
    }

    const subscribers = await Subscriber.find({});

    if (subscribers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "There are no subscribers yet",
      });
    }

    let sent = 0;
    const failed = [];

    for (const subscriber of subscribers) {
      try {
        await sendEmail({ to: subscriber.email, subject, html });
        sent += 1;
      } catch (error) {
        console.error(`Newsletter send failed for ${subscriber.email}:`, error);
        failed.push(subscriber.email);
      }
    }

    res.status(200).json({
      success: true,
      message: `Sent to ${sent} of ${subscribers.length} subscribers`,
      sent,
      total: subscribers.length,
      failed,
    });
  } catch (error) {
    console.error("Send Campaign Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
