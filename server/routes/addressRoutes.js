import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} from "../controllers/addressController.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/", getAddresses);
router.post("/", addAddress);
router.put("/:id", updateAddress);
router.delete("/:id", deleteAddress);
router.put("/:id/default", setDefaultAddress);

export default router;
