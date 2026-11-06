import { encryptPassword } from "../utils/vaultCrypto";
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import type { PasswordChallengePurpose } from "@prisma/client";
import { prisma } from "../db/prisma";
import { hashToken } from "../utils/tokens";
import { assertEmailConfigured } from "./email.service";
import { createSession, lockUser } from "./session.service";
import { assertNewPassword, generateOtp, hashOtp, otpMatches, PasswordActionError, OTP_TTL_MS, RESEND_COOLDOWN_MS, RESET_SESSION_TTL_MS, MAX_OTP_ATTEMPTS } from "../utils/passwordSecurity";

const invalidCode = () => new PasswordActionError(400, "This code is invalid, expired, or has reached its attempt limit.", "INVALID_OTP");
const invalidSession = () => new PasswordActionError(403, "Your password verification has expired. Verify your email again.", "RESET_SESSION_EXPIRED");

/** A generic response and opaque request ID do not disclose whether an email exists. */
export async function requestPasswordCode(email: string, purpose: PasswordChallengePurpose, authenticatedUserId?: string) {
  assertEmailConfigured();
  // Stable, keyed synthetic IDs make repeat requests indistinguishable for unknown emails.
  const digest = hashOtp("request", purpose, email.toLowerCase());
  const opaqueId = `${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}`;
  const generic = { message: "If this account is eligible, a verification code will be emailed shortly.", challengeId: opaqueId, resendAfter: 60, expiresIn: 600 };
  const user = await prisma.user.findFirst({ where: authenticatedUserId ? { id: authenticatedUserId } : { email: { equals: email, mode: "insensitive" } } });
  if (!user) return generic;
  if (purpose === "SET_PASSWORD" && user.passwordHash) throw new PasswordActionError(409, "Use your current password to change your password.");

  let code = generateOtp();
  const pending = await prisma.$transaction(async (tx) => {
    await lockUser(tx, user.id);
    const now = new Date();
    const existing = await tx.passwordChallenge.findUnique({ where: { userId_purpose: { userId: user.id, purpose } } });
    const latest = await tx.passwordChallenge.findFirst({ where: { userId: user.id }, orderBy: { lastSentAt: "desc" } });
    if (latest && now.getTime() - latest.lastSentAt.getTime() < RESEND_COOLDOWN_MS) return { id: existing?.id ?? generic.challengeId, send: false };
    // Resending cannot reset a 3-attempt lockout before its 10-minute expiry.
    if (existing && existing.failedAttempts >= MAX_OTP_ATTEMPTS && existing.expiresAt > now) return { id: existing.id, send: false };
    const id = existing?.id ?? generic.challengeId;
    const data = {
      otpHash: hashOtp(id, purpose, code), failedAttempts: 0,
      expiresAt: new Date(now.getTime() + OTP_TTL_MS), lastSentAt: now,
      verifiedAt: null, consumedAt: null, grantHash: null, grantExpiresAt: null,
    };
    await tx.passwordChallenge.upsert({ where: { userId_purpose: { userId: user.id, purpose } },
      create: { id, userId: user.id, purpose, ...data }, update: data });
    await tx.passwordEmail.deleteMany({ where: { challengeId: id } });
    const encrypted = encryptPassword(code);
    await tx.passwordEmail.create({ data: { challengeId: id, ciphertext: encrypted.ciphertext, iv: encrypted.iv, authTag: encrypted.authTag, expiresAt: data.expiresAt } });
    return { id, send: true };
  });
  code = "";
  return { ...generic, challengeId: pending.id };
}

/** Returns a random, restricted grant. It cannot call protected application routes. */
export async function verifyPasswordCode(id: string, code: string, purpose: PasswordChallengePurpose, authenticatedUserId?: string) {
  const challenge = await prisma.passwordChallenge.findUnique({ where: { id } });
  if (!challenge || challenge.purpose !== purpose || (authenticatedUserId && challenge.userId !== authenticatedUserId)) throw invalidCode();
  const result = await prisma.$transaction(async (tx) => {
    await lockUser(tx, challenge.userId);
    const current = await tx.passwordChallenge.findUnique({ where: { id } });
    const now = new Date();
    if (!current || current.consumedAt || current.verifiedAt || current.expiresAt <= now || current.failedAttempts >= MAX_OTP_ATTEMPTS) return null;
    if (!otpMatches(current.otpHash, hashOtp(id, purpose, code))) {
      // Return the failure from the transaction so the increment commits before throwing.
      await tx.passwordChallenge.update({ where: { id }, data: { failedAttempts: { increment: 1 } } });
      return null;
    }
    const grant = randomBytes(32).toString("hex");
    await tx.passwordChallenge.update({ where: { id }, data: {
      verifiedAt: now, otpHash: hashToken(randomBytes(32).toString("hex")),
      grantHash: hashToken(grant), grantExpiresAt: new Date(now.getTime() + RESET_SESSION_TTL_MS),
    } });
    return grant;
  });
  if (!result) throw invalidCode();
  return result;
}

async function replacePassword(userId: string, passwordHash: string, grantHash?: string, expectedPasswordHash?: string) {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw invalidSession();
    if (expectedPasswordHash && user.passwordHash !== expectedPasswordHash) throw new PasswordActionError(401, "Your password changed. Please sign in again.");
    if (grantHash) {
      const consumed = await tx.passwordChallenge.updateMany({ where: {
        userId, grantHash, consumedAt: null, verifiedAt: { not: null }, grantExpiresAt: { gt: new Date() },
      }, data: { consumedAt: new Date(), grantHash: null } });
      if (consumed.count !== 1) throw invalidSession();
    }
    const updated = await tx.user.update({ where: { id: userId }, data: {
      passwordHash, passwordChangedAt: new Date(), authVersion: { increment: 1 },
    } });
    // Revoke every old refresh AND access session. Only the newly verified session survives.
    await tx.refreshToken.deleteMany({ where: { userId } });
    await tx.passwordChallenge.updateMany({ where: { userId }, data: { consumedAt: new Date(), grantHash: null } });
    const session = await createSession(tx, updated);
    return { ...session, user: { userId: updated.id, email: updated.email, hasPassword: true, googleLinked: Boolean(updated.googleId), updatedAt: updated.updatedAt, passwordChangedAt: updated.passwordChangedAt } };
  });
}

export async function completePasswordCode(grant: string, password: unknown, purpose: PasswordChallengePurpose, userId?: string) {
  assertNewPassword(password);
  if (!/^[a-f0-9]{64}$/.test(grant)) throw invalidSession();
  const grantHash = hashToken(grant);
  const challenge = await prisma.passwordChallenge.findUnique({ where: { grantHash } });
  if (!challenge || challenge.purpose !== purpose || challenge.consumedAt || !challenge.grantExpiresAt || challenge.grantExpiresAt <= new Date() || (userId && challenge.userId !== userId)) throw invalidSession();
  const passwordHash = await bcrypt.hash(password, 12);
  return replacePassword(challenge.userId, passwordHash, grantHash);
}

export async function changePassword(userId: string, currentPassword: unknown, newPassword: unknown) {
  assertNewPassword(newPassword);
  if (typeof currentPassword !== "string" || Buffer.byteLength(currentPassword, "utf8") > 72) throw new PasswordActionError(400, "Enter your current password.");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.passwordHash) throw new PasswordActionError(403, "Verify your email with a code before setting a password.", "EMAIL_VERIFICATION_REQUIRED");
  if (!await bcrypt.compare(currentPassword, user.passwordHash)) throw new PasswordActionError(400, "Your current password is incorrect.", "CURRENT_PASSWORD_INVALID");
  if (await bcrypt.compare(newPassword, user.passwordHash)) throw new PasswordActionError(400, "Choose a password different from your current password.");
  return replacePassword(userId, await bcrypt.hash(newPassword, 12), undefined, user.passwordHash);
}
