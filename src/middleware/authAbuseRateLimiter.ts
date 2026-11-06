import rateLimit from "express-rate-limit";

const authAbuseRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ message: "Too many requests. Please try again later." });
  },
});

export default authAbuseRateLimiter;
