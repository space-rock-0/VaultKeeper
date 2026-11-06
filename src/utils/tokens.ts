import { createHash, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

export interface TokenPayload {
  userId: string;
  email: string;
  authVersion?: number;
}

function getSecret(name: "ACCESS_TOKEN_SECRET" | "REFRESH_TOKEN_SECRET"): string {
  const secret = process.env[name];
  if (!secret) {
    throw new Error(`${name} is not configured`);
  }
  return secret;
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, getSecret("ACCESS_TOKEN_SECRET"), {
    expiresIn: "15m",
  });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, getSecret("REFRESH_TOKEN_SECRET"), {
    expiresIn: "7d",
    jwtid: randomUUID(),
  });
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
