import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { generateAccessToken, generateRefreshToken, hashToken } from "../utils/tokens";
import { PasswordActionError } from "../utils/passwordSecurity";

export type SessionUser = { id: string; email: string; authVersion: number };
export const refreshCookieOptions = {
  httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, path: "/api/auth",
};

/** All credential/session mutations take this lock, including OTP verification.
 * A row lock works across API instances and prevents reset/login/refresh races. */
export async function lockUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
}

export async function createSession(tx: Prisma.TransactionClient, user: SessionUser) {
  const payload = { userId: user.id, email: user.email, authVersion: user.authVersion };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  await tx.refreshToken.create({ data: {
    userId: user.id, token: hashToken(refreshToken), expiresAt: new Date(Date.now() + refreshCookieOptions.maxAge),
  } });
  return { accessToken, refreshToken };
}

export async function issueSession(user: SessionUser) {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, user.id);
    const current = await tx.user.findUnique({ where: { id: user.id } });
    if (!current || current.authVersion !== user.authVersion) throw new PasswordActionError(401, "Your credentials changed. Please sign in again.");
    return createSession(tx, current);
  });
}
