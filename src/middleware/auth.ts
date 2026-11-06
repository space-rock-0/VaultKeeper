import { prisma } from "../db/prisma";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { TokenPayload } from "../utils/tokens";

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authorization = req.headers.authorization;
  const [scheme, token] = authorization?.split(" ") ?? [];

  if (scheme !== "Bearer" || !token) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const secret = process.env.ACCESS_TOKEN_SECRET;
    if (!secret) {
      throw new Error("ACCESS_TOKEN_SECRET is not configured");
    }

    const decoded = jwt.verify(token, secret);
    if (typeof decoded === "string" || typeof decoded.userId !== "string" || typeof decoded.email !== "string") {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    if (decoded.authVersion !== undefined && (!Number.isInteger(decoded.authVersion) || decoded.authVersion < 0)) {
      res.status(403).json({ message: "Forbidden", code: "INVALID_ACCESS_TOKEN" }); return;
    }
    const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { authVersion: true } });
    if (!user || user.authVersion !== (decoded.authVersion ?? 0)) {
      res.status(403).json({ message: "Your session was revoked. Please sign in again.", code: "SESSION_REVOKED" }); return;
    }
    req.user = { userId: decoded.userId, email: decoded.email, authVersion: user.authVersion };
    next();
  } catch (error) {
    if (!(error instanceof jwt.JsonWebTokenError)) {
      res.status(503).json({ message: "Authentication is temporarily unavailable." }); return;
    }
    res.status(403).json({ message: "Forbidden", code: error instanceof jwt.TokenExpiredError ? "TOKEN_EXPIRED" : "INVALID_ACCESS_TOKEN" });
  }
}
