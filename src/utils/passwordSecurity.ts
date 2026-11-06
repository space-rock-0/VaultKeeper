import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_TTL_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const RESET_SESSION_TTL_MS = 5 * 60 * 1000;
export const MAX_OTP_ATTEMPTS = 3;

export class PasswordActionError extends Error {
  constructor(public status: number, message: string, public code = "PASSWORD_ACTION_FAILED") { super(message); }
}

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// Keyed SHA-256 prevents offline enumeration of all one million codes after a DB leak.
// Challenge ID and purpose prevent a hash/code from being moved between requests.
export function hashOtp(id: string, purpose: string, otp: string): string {
  const secret = process.env.OTP_HASH_SECRET;
  if (!secret || secret.length < 32) throw new PasswordActionError(503, "Email verification is temporarily unavailable.");
  return createHmac("sha256", secret).update(`${id}:${purpose}:${otp}`).digest("hex");
}

export function otpMatches(expected: string, actual: string): boolean {
  const first = Buffer.from(expected, "hex");
  const second = Buffer.from(actual, "hex");
  return first.length === 32 && second.length === 32 && timingSafeEqual(first, second);
}

export function assertNewPassword(value: unknown): asserts value is string {
  if (typeof value !== "string" || Array.from(value).length < 12 || Buffer.byteLength(value, "utf8") > 72) {
    throw new PasswordActionError(400, "Use a new password with at least 12 characters and at most 72 UTF-8 bytes.");
  }
}
