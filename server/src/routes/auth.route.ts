import { Router } from "express";
import {
  emailLogin,
  emailSignUp,
  refreshToken,
} from "../controllers/auth.controller.js";

const router = Router();

router.post("/register", emailSignUp);

router.post("/login", emailLogin);

router.post("/refresh", refreshToken);

export default router;
