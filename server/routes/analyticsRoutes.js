import express from "express";

import {
  recordVisit,
  getProductViewCount,
  getMyLocation,
} from "../controllers/analyticsController.js";

const router = express.Router();

router.post("/visit", recordVisit);
router.get("/product-views/:id", getProductViewCount);
router.get("/my-location", getMyLocation);

export default router;
