import { PasswordActionError } from "../utils/passwordSecurity";
import { createSession, issueSession, lockUser } from "../services/session.service";
import { OAuth2Client } from "google-auth-library";
import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  type TokenPayload,
} from "../utils/tokens";
import { prisma } from "../db/prisma";

const refreshCookieName = "refreshToken";
const refreshLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const dummyPasswordHash = bcrypt.hash("auth-dummy-password", 12);

const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: refreshLifetimeMs,
  path: "/api/auth",
});

function clearRefreshCookie(res: Response): void {
  res.clearCookie(refreshCookieName, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
  });
}

function getRefreshCookie(req: Request): string | undefined {
  return (req as Request & { cookies?: Record<string, string> }).cookies?.[refreshCookieName];
}

function isTokenPayload(value: unknown): value is TokenPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.userId === "string" && typeof payload.email === "string" && (payload.authVersion === undefined || (Number.isInteger(payload.authVersion) && Number(payload.authVersion) >= 0));
}

function isDatabaseUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const failure = error as { name?: string; code?: string; errorCode?: string };
  return failure.name === "PrismaClientInitializationError"
    || ["P1001", "P1002", "P1008", "P1017"].includes(failure.code ?? failure.errorCode ?? "");
}

function respondToAuthFailure(error: unknown, res: Response, fallback: string): void {
  if (error instanceof PasswordActionError) { res.status(error.status).json({ message: error.message, code: error.code }); return; }
  if (isDatabaseUnavailable(error)) {
    // Never log request bodies, credentials, or connection strings.
    console.error("Authentication database connection unavailable.");
    res.status(503).json({ message: "Authentication is temporarily unavailable. Please try again shortly.", code: "AUTH_SERVICE_UNAVAILABLE" });
    return;
  }
  res.status(500).json({ message: fallback });
}

export async function signup(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || !email.trim() || typeof password !== "string" || password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
      res.status(400).json({ message: "Enter a valid email and a password between 8 and 72 bytes." });
      return;
    }

    const normalizedEmail = email.trim();
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      res.status(400).json({ message: "Email is already taken." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email: normalizedEmail, passwordHash },
      select: { id: true, email: true, createdAt: true },
    });
    res.status(201).json({ user });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      res.status(400).json({ message: "Email is already taken." });
      return;
    }
    respondToAuthFailure(error, res, "Unable to create account.");
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string" || Buffer.byteLength(password, "utf8") > 72) {
      res.status(401).json({ message: "Invalid email or password." });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: email.trim() } });
    const passwordMatches = await bcrypt.compare(
      password,
      user?.passwordHash ?? (await dummyPasswordHash),
    );
    if (user?.googleId && !user.passwordHash) {
      res.status(401).json({ message: "This account was created via Google OAuth. Please log in using Google.", code: "GOOGLE_OAUTH_REQUIRED" });
      return;
    }
    if (!user || !user.passwordHash || !passwordMatches) {
      res.status(401).json({ message: "Invalid email or password." });
      return;
    }

    const { accessToken, refreshToken } = await issueSession(user);

    res.cookie(refreshCookieName, refreshToken, refreshCookieOptions());
    res.status(200).json({ accessToken });
  } catch (error) {
    respondToAuthFailure(error, res, "Unable to log in.");
  }
}

const googleClient = new OAuth2Client();

export async function googleLogin(req: Request, res: Response): Promise<void> {
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) {
    res.status(503).json({ message: "Google sign-in is not configured yet." });
    return;
  }
  const credential: unknown = req.body?.credential;
  if (typeof credential !== "string" || !credential || credential.length > 12000) {
    res.status(400).json({ message: "A Google sign-in credential is required." });
    return;
  }
  let identity;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience });
    identity = ticket.getPayload();
    if (!identity?.sub || !identity.email || identity.email_verified !== true) {
      res.status(401).json({ message: "Use a Google account with a verified email address." });
      return;
    }
  } catch {
    res.status(401).json({ message: "Google sign-in could not be verified. Please try again." });
    return;
  }
  try {
    let user = await prisma.user.findUnique({ where: { googleId: identity.sub } });
    if (!user) {
      const existing = await prisma.user.findUnique({ where: { email: identity.email } });
      if (existing) {
        res.status(409).json({ message: "This email already has an account. Sign in with your password, then connect Google in Account security." });
        return;
      }
      user = await prisma.user.create({ data: { email: identity.email, googleId: identity.sub } });
    }
    const { accessToken, refreshToken } = await issueSession(user);
    res.cookie(refreshCookieName, refreshToken, refreshCookieOptions());
    res.status(200).json({ accessToken });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      res.status(409).json({ message: "An account already exists. Try signing in again." });
      return;
    }
    respondToAuthFailure(error, res, "Unable to sign in with Google.");
  }
}

export async function linkGoogle(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ message: "Unauthorized." }); return; }
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) { res.status(503).json({ message: "Google sign-in is not configured yet." }); return; }
  const credential: unknown = req.body?.credential;
  if (typeof credential !== "string" || !credential || credential.length > 12000) {
    res.status(400).json({ message: "A Google sign-in credential is required." }); return;
  }
  let identity;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience });
    identity = ticket.getPayload();
    if (!identity?.sub || !identity.email || identity.email_verified !== true) {
      res.status(401).json({ message: "Use a Google account with a verified email address." }); return;
    }
  } catch {
    res.status(401).json({ message: "Google sign-in could not be verified. Please try again." }); return;
  }
  try {
    const googleId = identity.sub;
    const googleEmail = identity.email;
    const linked = await prisma.$transaction(async (tx) => {
      await lockUser(tx, req.user!.userId);
      const current = await tx.user.findUnique({ where: { id: req.user!.userId } });
      if (!current) throw new PasswordActionError(401, "Unauthorized.");
      if (current.email.toLowerCase() !== googleEmail.toLowerCase()) throw new PasswordActionError(409, "Choose the Google account with the same email address.");
      if (current.googleId && current.googleId !== googleId) throw new PasswordActionError(409, "A different Google account is already connected.");
      const owner = await tx.user.findUnique({ where: { googleId } });
      if (owner && owner.id !== current.id) throw new PasswordActionError(409, "This Google account is connected to another user.");
      if (current.googleId) return current;
      return tx.user.update({ where: { id: current.id }, data: { googleId } });
    });
    res.json({ message: "Google account connected.", user: { userId: linked.id, email: linked.email, hasPassword: Boolean(linked.passwordHash), googleLinked: true, updatedAt: linked.updatedAt, passwordChangedAt: linked.passwordChangedAt } });
  } catch (error) {
    if (error instanceof PasswordActionError) { res.status(error.status).json({ message: error.message }); return; }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      res.status(409).json({ message: "This Google account is connected to another user." }); return;
    }
    respondToAuthFailure(error, res, "Unable to connect Google account.");
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const rawRefreshToken = getRefreshCookie(req);
  if (!rawRefreshToken) {
    res.status(401).json({ message: "Refresh token is required." });
    return;
  }

  try {
    const secret = process.env.REFRESH_TOKEN_SECRET;
    if (!secret) throw new Error("Refresh token secret is not configured");

    const decoded: unknown = jwt.verify(rawRefreshToken, secret);
    if (!isTokenPayload(decoded)) {
      clearRefreshCookie(res);
      res.status(403).json({ message: "Invalid refresh token." });
      return;
    }

    const tokenHash = hashToken(rawRefreshToken);
    const storedToken = await prisma.refreshToken.findUnique({ where: { token: tokenHash } });
    if (!storedToken || storedToken.expiresAt <= new Date() || storedToken.userId !== decoded.userId) {
      clearRefreshCookie(res);
      res.status(403).json({ message: "Invalid refresh token." });
      return;
    }

    const rotated = await prisma.$transaction(async (tx) => {
      await lockUser(tx, decoded.userId);
      const user = await tx.user.findUnique({ where: { id: decoded.userId } });
      const current = await tx.refreshToken.findUnique({ where: { id: storedToken.id } });
      if (!user || !current || current.expiresAt <= new Date() || user.authVersion !== (decoded.authVersion ?? 0)) return null;
      if (current.consumedAt) {
        await tx.refreshToken.deleteMany({ where: { userId: user.id } });
        await tx.user.update({ where: { id: user.id }, data: { authVersion: { increment: 1 } } });
        return null;
      }
      await tx.refreshToken.update({ where: { id: current.id }, data: { consumedAt: new Date() } });
      return createSession(tx, user);
    });
    if (!rotated) {
      clearRefreshCookie(res);
      res.status(403).json({ message: "Invalid refresh token." });
      return;
    }
    const { accessToken, refreshToken: newRefreshToken } = rotated;

    res.cookie(refreshCookieName, newRefreshToken, refreshCookieOptions());
    res.status(200).json({ accessToken });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      respondToAuthFailure(error, res, "Unable to refresh session.");
      return;
    }
    clearRefreshCookie(res);
    res.status(403).json({ message: "Invalid refresh token." });
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  try {
    const rawRefreshToken = getRefreshCookie(req);
    if (rawRefreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: hashToken(rawRefreshToken) } });
    }

    clearRefreshCookie(res);
    res.status(200).json({ message: "Logged out." });
  } catch {
    clearRefreshCookie(res);
    res.status(500).json({ message: "Unable to log out." });
  }
}


