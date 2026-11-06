import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_BYTES = 12;
const TAG_BYTES = 16;
const ALGORITHM = "aes-256-gcm";
const KEY_VERSION_PATTERN = /^[1-9]\d{0,2}$/;

export function getActiveEncryptionKeyVersion(): number {
  const configured = process.env.ENCRYPTION_KEY_VERSION ?? "1";
  if (!KEY_VERSION_PATTERN.test(configured)) throw new Error("ENCRYPTION_KEY_VERSION must be an integer from 1 to 999.");
  return Number(configured);
}

function keyFromEnv(version: number): Buffer {
  const namedKey = process.env[`ENCRYPTION_KEY_V${version}`];
  const key = namedKey ?? (version === 1 ? process.env.ENCRYPTION_KEY : undefined);
  if (!key || !/^[\da-fA-F]{64}$/.test(key)) {
    throw new Error(`A 32-byte ENCRYPTION_KEY_V${version} must be configured.`);
  }
  return Buffer.from(key, "hex");
}

function decodeCanonicalBase64(value: string): Buffer {
  if (!value || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("Invalid encrypted value encoding.");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) throw new Error("Invalid encrypted value encoding.");
  return decoded;
}

export function getCiphertextKeyVersion(ciphertext: string): number {
  const match = /^v([1-9]\d{0,2}):/.exec(ciphertext);
  return match ? Number(match[1]) : 1; // Unprefixed ciphertexts predate versioning and use key v1.
}

function splitCiphertext(ciphertext: string): { version: number; value: string } {
  const match = /^v([1-9]\d{0,2}):(.*)$/.exec(ciphertext);
  if (match) return { version: Number(match[1]), value: match[2] };
  if (/^v\d+:/.test(ciphertext)) throw new Error("Invalid ciphertext key version.");
  return { version: 1, value: ciphertext };
}

export function validateEncryptionKey(): void {
  const versions = new Set<number>([getActiveEncryptionKeyVersion()]);
  for (const name of Object.keys(process.env)) {
    const match = /^ENCRYPTION_KEY_V([1-9]\d{0,2})$/.exec(name);
    if (match) versions.add(Number(match[1]));
  }
  if (process.env.ENCRYPTION_KEY && !process.env.ENCRYPTION_KEY_V1) versions.add(1);
  for (const version of versions) {
    const key = keyFromEnv(version);
    key.fill(0);
  }
}

export interface EncryptedPassword {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

export function encryptPassword(text: string): EncryptedPassword {
  if (typeof text !== "string" || !text.length) throw new TypeError("Password must not be empty.");

  const keyVersion = getActiveEncryptionKeyVersion();
  const plaintext = Buffer.from(text, "utf8");
  const iv = randomBytes(IV_BYTES);
  const key = keyFromEnv(keyVersion);
  let ciphertext: Buffer | undefined;
  try {
    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
    key.fill(0);
    ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      ciphertext: keyVersion === 1 ? ciphertext.toString("base64") : `v${keyVersion}:${ciphertext.toString("base64")}`,
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      keyVersion,
    };
  } finally {
    key.fill(0);
    plaintext.fill(0);
    ciphertext?.fill(0);
    iv.fill(0);
  }
}

export function decryptPassword(ciphertext: string, iv: string, authTag: string): string {
  let key: Buffer | undefined;
  let encrypted: Buffer | undefined;
  let ivBytes: Buffer | undefined;
  let tagBytes: Buffer | undefined;
  let plaintext: Buffer | undefined;
  try {
    const parsed = splitCiphertext(ciphertext);
    encrypted = decodeCanonicalBase64(parsed.value);
    ivBytes = decodeCanonicalBase64(iv);
    tagBytes = decodeCanonicalBase64(authTag);
    if (!encrypted.length || ivBytes.length !== IV_BYTES || tagBytes.length !== TAG_BYTES) throw new Error();
    key = keyFromEnv(parsed.version);
    const decipher = createDecipheriv(ALGORITHM, key, ivBytes, { authTagLength: TAG_BYTES });
    key.fill(0);
    decipher.setAuthTag(tagBytes);
    plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    throw new Error("Unable to decrypt vault password.");
  } finally {
    key?.fill(0);
    encrypted?.fill(0);
    ivBytes?.fill(0);
    tagBytes?.fill(0);
    plaintext?.fill(0);
  }
}

