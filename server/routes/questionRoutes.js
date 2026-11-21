import express from "express";
import validateObjectId from "../middleware/validateObjectId.js";

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
import { questionIpLimiter, questionAccountLimiter } from "../middleware/questionLimiter.js";

const router = express.Router();

router.param("id", validateObjectId);
router.param("productId", validateObjectId);
const perm = requirePermission("questions");

router.get("/product/:productId", getProductQuestions);
// IP limiter first (cheap, needs no login); the account limiter needs
// req.user, so it must come after authMiddleware.
router.post("/", questionIpLimiter, authMiddleware, questionAccountLimiter, submitQuestion);

router.get("/admin", authMiddleware, adminMiddleware, perm, getAllQuestionsAdmin);
router.put("/:id/answer", authMiddleware, adminMiddleware, perm, answerQuestion);
router.put("/:id/seen", authMiddleware, adminMiddleware, perm, markQuestionSeen);
router.delete("/:id", authMiddleware, adminMiddleware, perm, deleteQuestion);

export default router;
