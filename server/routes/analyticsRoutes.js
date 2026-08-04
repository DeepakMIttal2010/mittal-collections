import express from "express";

import {
  recordVisit,
  getProductViewCount,
} from "../controllers/analyticsController.js";

const router = express.Router();

router.post("/visit", recordVisit);
router.get("/product-views/:id", getProductViewCount);

export default router;
