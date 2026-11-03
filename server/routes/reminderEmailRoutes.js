import express from "express";

import { optOutOfReminderEmails } from "../controllers/reminderEmailController.js";

const router = express.Router();

// Public — the token in the body is the proof (see the controller).
router.post("/opt-out", optOutOfReminderEmails);

export default router;
