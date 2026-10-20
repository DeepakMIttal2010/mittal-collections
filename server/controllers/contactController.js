import ContactMessage from "../models/ContactMessage.js";

// Was a single regex with 3 quantified groups over overlapping character
// classes -- CodeQL flagged this as polynomial-backtracking-prone on
// adversarial input (see productController.js's isValidEmail, same fix
// mirrored here). Splitting on the LAST "@" with a plain string op first
// does the same structural check with no backtracking possible.
const isValidEmail = (email) => {
  if (!email || typeof email !== "string" || email.length > 254) return false;
  const atIndex = email.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === email.length - 1) return false;
  const localPart = email.slice(0, atIndex);
  const domainPart = email.slice(atIndex + 1);
  if (/\s/.test(localPart) || /\s/.test(domainPart)) return false;
  if (!domainPart.includes(".")) return false;
  if (domainPart.startsWith(".") || domainPart.endsWith(".")) return false;
  return true;
};

// ============================
// SUBMIT MESSAGE (Public)
// ============================
export const submitMessage = async (req, res) => {
  try {
    const { name, email, mobile, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: "Name, email, subject and message are required",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address",
      });
    }

    await ContactMessage.create({
      name,
      email: email.toLowerCase().trim(),
      mobile,
      subject,
      message,
    });

    res.status(201).json({
      success: true,
      message: "Message sent successfully",
    });
  } catch (error) {
    console.error("Submit Message Error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to send message. Please try again.",
    });
  }
};

// ============================
// GET ALL MESSAGES (Admin)
// ============================
export const getMessages = async (req, res) => {
  try {
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    const messages = await ContactMessage.find().sort({
      createdAt: sortOrder,
    });

    res.status(200).json({
      success: true,
      messages,
    });
  } catch (error) {
    console.error("Get Messages Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// MARK AS READ (Admin)
// ============================
export const markAsRead = async (req, res) => {
  try {
    const contactMessage = await ContactMessage.findById(req.params.id);

    if (!contactMessage) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    contactMessage.isRead = true;
    await contactMessage.save();

    res.status(200).json({
      success: true,
      message: "Marked as read",
    });
  } catch (error) {
    console.error("Mark As Read Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// DELETE MESSAGE (Admin)
// ============================
export const deleteMessage = async (req, res) => {
  try {
    const contactMessage = await ContactMessage.findById(req.params.id);

    if (!contactMessage) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    await contactMessage.deleteOne();

    res.status(200).json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error) {
    console.error("Delete Message Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
