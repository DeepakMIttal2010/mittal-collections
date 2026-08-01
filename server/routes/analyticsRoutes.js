import express from "express";

import { recordVisit } from "../controllers/analyticsController.js";

const router = express.Router();

router.post("/visit", recordVisit);

export default router;
