import { rateLimit } from "express-rate-limit";
import { createHash } from "node:crypto";

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    return email
      ? `email:${createHash("sha256").update(email).digest("hex")}`
      : `missing-email:${req.ip}`;
  },
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => res.statusCode !== 401,
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
  message: {
    message: "Too many incorrect password attempts for this email. Please try again later.",
  },
});

export default loginRateLimiter;
