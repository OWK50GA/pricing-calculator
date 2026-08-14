import { Router } from "express";
import { getPeriodSummary } from "../controllers/report.controller";

const router = Router();

router.get("/summary", getPeriodSummary);

export default router;
