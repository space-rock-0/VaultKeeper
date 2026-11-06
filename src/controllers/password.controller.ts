import type { Request, Response } from "express";
import { prisma } from "../db/prisma";
import { changePassword, completePasswordCode, requestPasswordCode, verifyPasswordCode } from "../services/password.service";
import { PasswordActionError, RESET_SESSION_TTL_MS } from "../utils/passwordSecurity";
import { refreshCookieOptions } from "../services/session.service";

const grantCookie = "passwordAction";
const grantOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/api/auth/password", maxAge: RESET_SESSION_TTL_MS };
const clearGrant = (res: Response) => { const { maxAge: _, ...options } = grantOptions; res.clearCookie(grantCookie, options); };
const validId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function fail(res: Response, error: unknown): void {
  if (error instanceof PasswordActionError) { res.status(error.status).json({ message: error.message, code: error.code }); return; }
  console.error("Password security operation failed.");
  res.status(503).json({ message: "Password management is temporarily unavailable. Please try again later." });
}

export async function requestRecoveryCode(req: Request, res: Response): Promise<void> {
  const email = req.body?.email;
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    res.status(400).json({ message: "Enter a valid email address." }); return;
  }
  try { res.status(202).json(await requestPasswordCode(email.trim(), "RECOVERY")); }
  catch (error) { fail(res, error); }
}

export async function requestSettingsCode(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ message: "Unauthorized." }); return; }
  try { res.status(202).json(await requestPasswordCode(req.user.email, "SET_PASSWORD", req.user.userId)); }
  catch (error) { fail(res, error); }
}

async function verify(req: Request, res: Response, settings: boolean): Promise<void> {
  if (!validId(req.body?.challengeId) || typeof req.body?.otp !== "string" || !/^\d{6}$/.test(req.body.otp)) {
    res.status(400).json({ message: "Enter the six-digit code from your email." }); return;
  }
  try {
    const grant = await verifyPasswordCode(req.body.challengeId, req.body.otp, settings ? "SET_PASSWORD" : "RECOVERY", settings ? req.user?.userId : undefined);
    res.cookie(grantCookie, grant, grantOptions);
    res.json({ verified: true, expiresIn: RESET_SESSION_TTL_MS / 1000 });
  } catch (error) { fail(res, error); }
}
export const verifyRecoveryCode = (req: Request, res: Response) => verify(req, res, false);
export const verifySettingsCode = (req: Request, res: Response) => verify(req, res, true);

async function complete(req: Request, res: Response, settings: boolean): Promise<void> {
  try {
    const grant: unknown = req.cookies?.[grantCookie];
    if (typeof grant !== "string") throw new PasswordActionError(403, "Verify your email before setting a password.", "RESET_SESSION_EXPIRED");
    const result = await completePasswordCode(grant, req.body?.newPassword, settings ? "SET_PASSWORD" : "RECOVERY", settings ? req.user?.userId : undefined);
    // Clear raw request references before response processing; JS strings cannot be zeroized.
    if (req.body) req.body.newPassword = undefined;
    clearGrant(res);
    res.cookie("refreshToken", result.refreshToken, refreshCookieOptions);
    res.json({ accessToken: result.accessToken, user: result.user, message: "Your password has been saved." });
  } catch (error) {
    if (error instanceof PasswordActionError && error.status === 403) clearGrant(res);
    fail(res, error);
  }
}
export const completeRecovery = (req: Request, res: Response) => complete(req, res, false);
export const completeSettings = (req: Request, res: Response) => complete(req, res, true);

export async function updatePassword(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ message: "Unauthorized." }); return; }
  try {
    const result = await changePassword(req.user.userId, req.body?.currentPassword, req.body?.newPassword);
    if (req.body) { req.body.currentPassword = undefined; req.body.newPassword = undefined; }
    res.cookie("refreshToken", result.refreshToken, refreshCookieOptions);
    res.json({ accessToken: result.accessToken, user: result.user, message: "Your password has been updated." });
  } catch (error) { fail(res, error); }
}

export async function getAccount(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ message: "Unauthorized." }); return; }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { id: true, email: true, passwordHash: true, googleId: true, updatedAt: true, passwordChangedAt: true } });
    if (!user) { res.status(401).json({ message: "Unauthorized." }); return; }
    res.json({ user: { userId: user.id, email: user.email, hasPassword: Boolean(user.passwordHash), googleLinked: Boolean(user.googleId), updatedAt: user.updatedAt, passwordChangedAt: user.passwordChangedAt } });
  } catch (error) { fail(res, error); }
}
