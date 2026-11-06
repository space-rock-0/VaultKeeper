import { randomInt } from "node:crypto";

export interface PasswordGenerationOptions {
  length?: number;
  includeUppercase?: boolean;
  includeLowercase?: boolean;
  includeNumbers?: boolean;
  includeSymbols?: boolean;
}

const SETS = {
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lower: "abcdefghijklmnopqrstuvwxyz",
  numbers: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{}:,.?",
} as const;

export function generatePassword(options: PasswordGenerationOptions = {}): string {
  const length = options.length ?? 20;
  if (!Number.isInteger(length) || length < 12 || length > 128) {
    throw new RangeError("Length must be between 12 and 128.");
  }
  const enabled = [
    (options.includeUppercase ?? true) ? SETS.upper : "",
    (options.includeLowercase ?? true) ? SETS.lower : "",
    (options.includeNumbers ?? true) ? SETS.numbers : "",
    (options.includeSymbols ?? true) ? SETS.symbols : "",
  ].filter(Boolean);
  if (!enabled.length) throw new TypeError("Enable at least one character set.");
  if (length < enabled.length) throw new RangeError("Length is too short for enabled character sets.");

  const all = enabled.join("");
  const chars = enabled.map((set) => set[randomInt(set.length)]);
  while (chars.length < length) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
