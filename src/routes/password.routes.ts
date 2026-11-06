import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticateToken } from "../middleware/auth";
import { requireTrustedOrigin } from "../middleware/requireTrustedOrigin";
import { requestRecoveryCode, verifyRecoveryCode, completeRecovery, getAccount, requestSettingsCode, verifySettingsCode, completeSettings, updatePassword } from "../controllers/password.controller";

const router = Router();
router.use(requireTrustedOrigin);
// Database cooldown/attempt limits remain authoritative across restarts and instances.
// These per-IP limits provide a second, coarse layer against credential/email abuse.
const requestLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { message: "Too many email requests. Please try again later." } });
const verifyLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { message: "Too many verification attempts. Please try again later." } });
const passwordLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { message: "Too many password attempts. Please try again later." } });
router.post("/password/request", requestLimit, requestRecoveryCode);
router.post("/password/verify", verifyLimit, verifyRecoveryCode);
router.post("/password/reset", passwordLimit, completeRecovery);
router.get("/account", authenticateToken, getAccount);
router.post("/password/settings/request", authenticateToken, requestLimit, requestSettingsCode);
router.post("/password/settings/verify", authenticateToken, verifyLimit, verifySettingsCode);
router.post("/password/settings/complete", authenticateToken, passwordLimit, completeSettings);
router.put("/password", authenticateToken, passwordLimit, updatePassword);
export default router;
