import express from "express";

import {
  getProductQuestions,
  submitQuestion,
  getAllQuestionsAdmin,
  answerQuestion,
  markQuestionSeen,
  deleteQuestion,
} from "../controllers/questionController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";

const router = express.Router();

router.get("/product/:productId", getProductQuestions);
router.post("/", authMiddleware, submitQuestion);

router.get("/admin", authMiddleware, adminMiddleware, getAllQuestionsAdmin);
router.put("/:id/answer", authMiddleware, adminMiddleware, answerQuestion);
router.put("/:id/seen", authMiddleware, adminMiddleware, markQuestionSeen);
router.delete("/:id", authMiddleware, adminMiddleware, deleteQuestion);

export default router;
