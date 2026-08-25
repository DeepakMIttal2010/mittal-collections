import express from "express";

import { verifyWebhook, receiveWebhook } from "../controllers/whatsappController.js";

const router = express.Router();

// Meta hits this with GET once (dashboard verification) and POST on
// every subsequent event — no auth middleware, Meta itself isn't a
// logged-in session; the verify token / signature is the gate.
router.get("/webhook", verifyWebhook);
router.post("/webhook", receiveWebhook);

export default router;
