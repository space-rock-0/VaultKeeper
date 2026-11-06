import passwordRoutes from "./routes/password.routes";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { login, logout, refresh, signup, googleLogin, linkGoogle } from "./controllers/auth.controller";
import { authenticateToken } from "./middleware/auth";
import loginRateLimiter from "./middleware/loginRateLimiter";
import authAbuseRateLimiter from "./middleware/authAbuseRateLimiter";
import { allowedFrontendOrigins } from "./config/security";
import { requireTrustedOrigin } from "./middleware/requireTrustedOrigin";
import vaultRoutes from "./routes/vault.routes";

const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cache-Control", "no-store");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

app.use(cors({
  origin: (origin, callback) => {
    callback(null, !origin || allowedFrontendOrigins.includes(origin));
  },
  credentials: true,
  exposedHeaders: ["RateLimit-Reset"],
}));
app.use(express.json({ limit: "16kb", strict: true }));
app.use(cookieParser());

app.post("/api/auth/signup", requireTrustedOrigin, authAbuseRateLimiter, signup);
app.post("/api/auth/login", requireTrustedOrigin, loginRateLimiter, login);
app.post("/api/auth/google", requireTrustedOrigin, authAbuseRateLimiter, googleLogin);
app.post("/api/auth/google/link", requireTrustedOrigin, authenticateToken, authAbuseRateLimiter, linkGoogle);
app.post("/api/auth/refresh", requireTrustedOrigin, authAbuseRateLimiter, refresh);
app.post("/api/auth/logout", requireTrustedOrigin, authAbuseRateLimiter, logout);
app.use("/api/auth", passwordRoutes);
app.use("/api/vault", requireTrustedOrigin, vaultRoutes);

app.get("/api/me", authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) { next(error); return; }
  const status = typeof error === "object" && error !== null && "status" in error && error.status === 400 ? 400 : 500;
  res.status(status).json({ message: status === 400 ? "Invalid request." : "Internal server error." });
});

export default app;



