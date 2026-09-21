import Question from "../models/Question.js";
import Product from "../models/Product.js";
import SiteSettings from "../models/SiteSettings.js";
import { sendEmail } from "../config/mailer.js";
import { notifyUser } from "../utils/notify.js";
import { escapeHtml } from "../utils/escapeHtml.js";

// Unlike Tickets, submitting a question previously only ever produced
// an in-app admin notification (the unseen-questions poll) — an admin
// not actively watching the dashboard had no way to learn a customer
// was waiting on an answer. Mirrors ticketController.js's notifyAdmin.
const notifyAdmin = async (question, productName) => {
  try {
    const settings = await SiteSettings.findOne();

    if (!settings?.email) return;

    await sendEmail({
      to: settings.email,
      subject: `New product question: ${productName}`,
      html: `
        <p>A customer asked a question about <strong>${escapeHtml(productName)}</strong>:</p>
        <p>${escapeHtml(question.question)}</p>
        <p><a href="${process.env.CLIENT_URL}/admin/questions">View in admin panel</a></p>
      `,
    });
  } catch (error) {
    console.error("Notify Admin (Question) Error:", error);
  }
};

// ============================
// GET PUBLISHED Q&A FOR A PRODUCT (Public)
// ============================
export const getProductQuestions = async (req, res) => {
  try {
    const questions = await Question.find({
      product: req.params.productId,
      isPublished: true,
    })
      .populate("user", "name")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      questions,
    });
  } catch (error) {
    console.error("Get Product Questions Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// SUBMIT QUESTION (Logged-in user)
// ============================
export const submitQuestion = async (req, res) => {
  try {
    const { productId, question } = req.body;

    if (!productId || !question) {
      return res.status(400).json({
        success: false,
        message: "Product and question are required",
      });
    }

    const newQuestion = await Question.create({
      product: productId,
      user: req.user._id,
      question,
    });

    const product = await Product.findById(productId).select("name");
    notifyAdmin(newQuestion, product?.name || "a product").catch(() => {});

    res.status(201).json({
      success: true,
      message: "Thanks! We'll answer your question soon.",
      question: newQuestion,
    });
  } catch (error) {
    console.error("Submit Question Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// GET ALL QUESTIONS (Admin)
// ============================
export const getAllQuestionsAdmin = async (req, res) => {
  try {
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    const questions = await Question.find()
      .populate("user", "name email")
      .populate("product", "name image")
      .sort({ createdAt: sortOrder });

    res.status(200).json({
      success: true,
      questions,
    });
  } catch (error) {
    console.error("Get All Questions Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// ANSWER QUESTION (Admin)
// ============================
export const answerQuestion = async (req, res) => {
  try {
    const { answer, isPublished } = req.body;

    const question = await Question.findById(req.params.id).populate(
      "product",
      "name nameHi",
    );

    if (!question) {
      return res.status(404).json({
        success: false,
        message: "Question not found",
      });
    }

    // submitQuestion's own response tells the customer "we'll answer your
    // question soon" — this is the one moment that promise is actually
    // kept, so it's the moment to tell them, not every save (e.g. an
    // admin later just toggling isPublished shouldn't re-notify).
    const isNewAnswer = answer !== undefined && answer.trim() !== "" && !question.answer;

    if (answer !== undefined) question.answer = answer;
    question.isPublished =
      isPublished === undefined ? Boolean(answer) : isPublished;

    await question.save();

    if (isNewAnswer) {
      notifyUser({
        userId: question.user,
        type: "question_answered",
        title: "Your question was answered",
        message: `We answered your question about ${question.product?.name || "a product"}.`,
        link: `/product/${question.product?._id || ""}`,
      });
    }

    res.status(200).json({
      success: true,
      message: "Question updated",
      question,
    });
  } catch (error) {
    console.error("Answer Question Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// MARK QUESTION SEEN (Admin)
// ============================
export const markQuestionSeen = async (req, res) => {
  try {
    const question = await Question.findByIdAndUpdate(
      req.params.id,
      { isSeenByAdmin: true },
      { new: true },
    );

    if (!question) {
      return res.status(404).json({
        success: false,
        message: "Question not found",
      });
    }

    res.status(200).json({
      success: true,
      question,
    });
  } catch (error) {
    console.error("Mark Question Seen Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// DELETE QUESTION (Admin)
// ============================
export const deleteQuestion = async (req, res) => {
  try {
    const question = await Question.findByIdAndDelete(req.params.id);

    if (!question) {
      return res.status(404).json({
        success: false,
        message: "Question not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Question deleted",
    });
  } catch (error) {
    console.error("Delete Question Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
