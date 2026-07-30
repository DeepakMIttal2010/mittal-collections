import express from "express";
import { getStates } from "../controllers/stateController.js";

const router = express.Router();

router.get("/", getStates);

export default router;
