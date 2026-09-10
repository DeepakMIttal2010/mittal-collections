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
import requirePermission from "../middleware/requirePermission.js";

const router = express.Router();
const perm = requirePermission("questions");

router.get("/product/:productId", getProductQuestions);
router.post("/", authMiddleware, submitQuestion);

router.get("/admin", authMiddleware, adminMiddleware, perm, getAllQuestionsAdmin);
router.put("/:id/answer", authMiddleware, adminMiddleware, perm, answerQuestion);
router.put("/:id/seen", authMiddleware, adminMiddleware, perm, markQuestionSeen);
router.delete("/:id", authMiddleware, adminMiddleware, perm, deleteQuestion);

export default router;
