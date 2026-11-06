import { Router } from "express";
import {
  createVaultEntry,
  deleteVaultEntry,
  generateVaultPassword,
  listVaultEntries,
  revealVaultPassword,
  updateVaultEntry,
} from "../controllers/vault.controller";
import { authenticateToken } from "../middleware/auth";
import authAbuseRateLimiter from "../middleware/authAbuseRateLimiter";

const router = Router();
router.use(authenticateToken);
router.get("/generate-password", authAbuseRateLimiter, generateVaultPassword);
router.get("/", listVaultEntries);
router.get("/:id/password", authAbuseRateLimiter, revealVaultPassword);
router.post("/", authAbuseRateLimiter, createVaultEntry);
router.put("/:id", updateVaultEntry);
router.delete("/:id", deleteVaultEntry);

export default router;


