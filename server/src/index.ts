import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.route.js";
import documentRoutes from "./routes/document.route.js";
import reportRoutes from "./routes/report.route.js";
import { authenticate } from "./middleware/authenticate.js";

const PORT = process.env.PORT ?? 3001;
const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  return res.json({ status: "healthy" });
});

// Public — no auth required
app.use("/auth", authRoutes);

// Protected — JWT required
app.use("/documents", authenticate, documentRoutes);
app.use("/reports",   authenticate, reportRoutes);

app.listen(PORT, () => {
  console.log("Server is running on port ", PORT);
});
