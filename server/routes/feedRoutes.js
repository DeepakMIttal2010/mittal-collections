import express from "express";

import { getGoogleProductFeed } from "../controllers/feedController.js";

const router = express.Router();

// Public — Google Merchant Center / Meta Commerce Manager fetch this
// directly, no auth.
router.get("/google.xml", getGoogleProductFeed);

export default router;
