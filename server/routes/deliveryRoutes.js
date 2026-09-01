import express from "express";

import { checkPincode } from "../controllers/deliveryController.js";

const router = express.Router();

router.get("/check-pincode/:pincode", checkPincode);

export default router;
