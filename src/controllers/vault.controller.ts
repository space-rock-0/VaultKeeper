import type { Request, Response } from "express";
import { generatePassword, type PasswordGenerationOptions } from "../utils/cryptoGenerator";
import { decryptPassword, encryptPassword } from "../utils/vaultCrypto";
import { prisma } from "../db/prisma";

const intervals = ["WEEKLY", "MONTHLY", "YEARLY", "CUSTOM"] as const;
type Interval = (typeof intervals)[number];

const publicFields = {
  id: true, userId: true, siteName: true, siteUrl: true, username: true,
  renewalInterval: true, expiresAt: true, createdAt: true, updatedAt: true,
} as const;

const userIdFor = (req: Request) => req.user?.userId ?? null;
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const hasOnly = (obj: Record<string, unknown>, keys: string[]) =>
  Object.keys(obj).every((key) => keys.includes(key));
const validInterval = (value: unknown): value is Interval =>
  typeof value === "string" && intervals.includes(value as Interval);

function encryptRequestPassword(body: Record<string, unknown>) {
  let plaintext = body.password;
  // Drop the request-object reference before any database await. JS strings themselves cannot be zeroized.
  body.password = undefined;
  try {
    if (typeof plaintext !== "string") throw new TypeError("Invalid password.");
    return encryptPassword(plaintext);
  } finally {
    plaintext = "";
  }
}
function parseSiteUrl(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function getExpiry(interval: Interval, custom: unknown): Date | null {
  if (interval === "CUSTOM") {
    if (typeof custom !== "string") return null;
    const date = new Date(custom);
    return Number.isNaN(date.getTime()) || date <= new Date() ? null : date;
  }
  const days = { WEEKLY: 7, MONTHLY: 30, YEARLY: 365 } as const;
  return new Date(Date.now() + days[interval] * 24 * 60 * 60 * 1000);
}

function serverError(res: Response): void {
  res.status(500).json({ message: "Unable to process vault request." });
}

function validId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function listVaultEntries(req: Request, res: Response): Promise<void> {
  const userId = userIdFor(req);
  if (!userId) { res.status(401).json({ message: "Unauthorized." }); return; }
  try {
    const entries = await prisma.passwordVault.findMany({
      where: { userId }, orderBy: { createdAt: "desc" }, select: publicFields,
    });
    const now = new Date();
    res.status(200).json({
      entries: entries.map((entry) => ({
        ...entry,
        renewalStatus: entry.expiresAt <= now ? "Needs Renewal" : "Current",
      })),
    });
  } catch { serverError(res); }
}

export async function revealVaultPassword(req: Request, res: Response): Promise<void> {
  const userId = userIdFor(req);
  if (!userId) { res.status(401).json({ message: "Unauthorized." }); return; }
  if (!validId(req.params.id)) { res.status(404).json({ message: "Vault entry not found." }); return; }
  try {
    const entry = await prisma.passwordVault.findFirst({
      where: { id: req.params.id, userId },
      select: { encryptedPassword: true, iv: true, authTag: true },
    });
    if (!entry) { res.status(404).json({ message: "Vault entry not found." }); return; }
    res.setHeader("Cache-Control", "no-store, private");
    res.status(200).json({ password: decryptPassword(entry.encryptedPassword, entry.iv, entry.authTag) });
  } catch { serverError(res); }
}
export async function createVaultEntry(req: Request, res: Response): Promise<void> {
  const userId = userIdFor(req);
  if (!userId) { res.status(401).json({ message: "Unauthorized." }); return; }
  const body = req.body;
  const allowed = ["siteName", "siteUrl", "username", "password", "renewalInterval", "expiresAt"];
  if (!isObject(body) || !hasOnly(body, allowed)) {
    res.status(400).json({ message: "Invalid vault entry." }); return;
  }
  const siteName = typeof body.siteName === "string" ? body.siteName.trim() : "";
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const siteUrl = parseSiteUrl(body.siteUrl);
  const interval: unknown = body.renewalInterval ?? "MONTHLY";
  if (!siteName || siteName.length > 100 || !username || username.length > 254
    || typeof body.password !== "string" || !body.password
    || Buffer.byteLength(body.password, "utf8") > 4096
    || siteUrl === undefined || !validInterval(interval)) {
    res.status(400).json({ message: "Provide valid site details, password, and renewal interval." }); return;
  }
  if (body.expiresAt !== undefined && interval !== "CUSTOM") { res.status(400).json({ message: "expiresAt can only be set with CUSTOM renewal." }); return; }
  const expiresAt = getExpiry(interval, body.expiresAt);
  if (!expiresAt) {
    res.status(400).json({ message: "A valid future expiresAt date is required for CUSTOM renewal." }); return;
  }
  try {
    const encrypted = encryptRequestPassword(body);
    const entry = await prisma.passwordVault.create({
      data: {
        userId, siteName, siteUrl, username,
        encryptedPassword: encrypted.ciphertext, iv: encrypted.iv, authTag: encrypted.authTag,
        renewalInterval: interval, expiresAt,
      },
      select: publicFields,
    });
    res.status(201).json({ entry });
  } catch { serverError(res); }
}

export async function updateVaultEntry(req: Request, res: Response): Promise<void> {
  const userId = userIdFor(req);
  if (!userId) { res.status(401).json({ message: "Unauthorized." }); return; }
  if (!validId(req.params.id)) { res.status(404).json({ message: "Vault entry not found." }); return; }
  const body = req.body;
  const allowed = ["siteName", "siteUrl", "username", "password", "renewalInterval", "expiresAt"];
  if (!isObject(body) || !hasOnly(body, allowed) || !Object.keys(body).length) {
    res.status(400).json({ message: "Invalid vault update." }); return;
  }

  const passwordUpdated = body.password !== undefined;
  try {
    const existing = await prisma.passwordVault.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true, renewalInterval: true },
    });
    if (!existing) { res.status(404).json({ message: "Vault entry not found." }); return; }

    const data: {
      siteName?: string; siteUrl?: string | null; username?: string;
      encryptedPassword?: string; iv?: string; authTag?: string;
      renewalInterval?: Interval; expiresAt?: Date;
    } = {};

    if (body.siteName !== undefined) {
      if (typeof body.siteName !== "string" || !body.siteName.trim() || body.siteName.trim().length > 100) {
        res.status(400).json({ message: "Invalid site name." }); return;
      }
      data.siteName = body.siteName.trim();
    }
    if (body.siteUrl !== undefined) {
      const url = parseSiteUrl(body.siteUrl);
      if (url === undefined) { res.status(400).json({ message: "Provide a valid HTTP or HTTPS URL." }); return; }
      data.siteUrl = url;
    }
    if (body.username !== undefined) {
      if (typeof body.username !== "string" || !body.username.trim() || body.username.trim().length > 254) {
        res.status(400).json({ message: "Invalid username." }); return;
      }
      data.username = body.username.trim();
    }
    if (body.password !== undefined) {
      if (typeof body.password !== "string" || !body.password || Buffer.byteLength(body.password, "utf8") > 4096) {
        res.status(400).json({ message: "Provide a valid password." }); return;
      }
      const encrypted = encryptRequestPassword(body);
      data.encryptedPassword = encrypted.ciphertext;
      data.iv = encrypted.iv;
      data.authTag = encrypted.authTag;
    }

    if (body.renewalInterval !== undefined && !validInterval(body.renewalInterval)) {
      res.status(400).json({ message: "Invalid renewal interval." }); return;
    }
    const interval = (body.renewalInterval as Interval | undefined) ?? (existing.renewalInterval as Interval);
    if (body.renewalInterval !== undefined || body.expiresAt !== undefined || passwordUpdated) {
      if (body.expiresAt !== undefined && interval !== "CUSTOM") {
        res.status(400).json({ message: "expiresAt can only be set with CUSTOM renewal." }); return;
      }
      const expiresAt = getExpiry(interval, body.expiresAt);
      if (!expiresAt) {
        res.status(400).json({ message: "A valid future expiresAt date is required for CUSTOM renewal, including when changing its password." }); return;
      }
      data.renewalInterval = interval;
      data.expiresAt = expiresAt;
    }

    const updated = await prisma.passwordVault.updateMany({
      where: { id: existing.id, userId }, data,
    });
    if (!updated.count) { res.status(404).json({ message: "Vault entry not found." }); return; }
    const entry = await prisma.passwordVault.findFirst({
      where: { id: existing.id, userId }, select: publicFields,
    });
    if (!entry) { res.status(404).json({ message: "Vault entry not found." }); return; }
    res.status(200).json({ entry });
  } catch { serverError(res); }
}

export async function deleteVaultEntry(req: Request, res: Response): Promise<void> {
  const userId = userIdFor(req);
  if (!userId) { res.status(401).json({ message: "Unauthorized." }); return; }
  if (!validId(req.params.id)) { res.status(404).json({ message: "Vault entry not found." }); return; }
  try {
    const result = await prisma.passwordVault.deleteMany({ where: { id: req.params.id, userId } });
    if (!result.count) { res.status(404).json({ message: "Vault entry not found." }); return; }
    res.status(200).json({ message: "Vault entry deleted." });
  } catch { serverError(res); }
}

function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

export function generateVaultPassword(req: Request, res: Response): void {
  const options: PasswordGenerationOptions = {};
  if (req.query.length !== undefined) {
    const length = Number(req.query.length);
    if (!Number.isInteger(length)) { res.status(400).json({ message: "length must be an integer." }); return; }
    options.length = length;
  }
  const flags = [
    ["includeUppercase", req.query.includeUppercase],
    ["includeLowercase", req.query.includeLowercase],
    ["includeNumbers", req.query.includeNumbers],
    ["includeSymbols", req.query.includeSymbols],
  ] as const;
  for (const [name, value] of flags) {
    const parsed = parseBoolean(value);
    if (value !== undefined && parsed === undefined) {
      res.status(400).json({ message: "Character-set options must be true or false." }); return;
    }
    if (name === "includeUppercase" && parsed !== undefined) options.includeUppercase = parsed;
    if (name === "includeLowercase" && parsed !== undefined) options.includeLowercase = parsed;
    if (name === "includeNumbers" && parsed !== undefined) options.includeNumbers = parsed;
    if (name === "includeSymbols" && parsed !== undefined) options.includeSymbols = parsed;
  }
  try { res.status(200).json({ password: generatePassword(options) }); }
  catch { res.status(400).json({ message: "Invalid password generation options." }); }
}






