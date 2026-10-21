import express from "express";
import validateObjectId from "../middleware/validateObjectId.js";

import authMiddleware from "../middleware/authMiddleware.js";
import adminMiddleware from "../middleware/adminMiddleware.js";
import requirePermission from "../middleware/requirePermission.js";

import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getRecurringExpenses,
  createRecurringExpense,
  updateRecurringExpense,
  deactivateRecurringExpense,
} from "../controllers/expenseController.js";

const router = express.Router();

router.param("id", validateObjectId);

// Business financials -- gated by its own "expenses" permission so a
// staff role can be given orders/products without ever seeing costs.
const guard = [authMiddleware, adminMiddleware, requirePermission("expenses")];

// Recurring templates first: "/recurring" must not be captured by "/:id".
router.get("/recurring", ...guard, getRecurringExpenses);
router.post("/recurring", ...guard, createRecurringExpense);
router.put("/recurring/:id", ...guard, updateRecurringExpense);
router.delete("/recurring/:id", ...guard, deactivateRecurringExpense);

router.get("/", ...guard, getExpenses);
router.post("/", ...guard, createExpense);
router.put("/:id", ...guard, updateExpense);
router.delete("/:id", ...guard, deleteExpense);

export default router;
