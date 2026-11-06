const assert = require("node:assert/strict");
const path = require("node:path");
const { buildSync } = require("esbuild");
const root = path.resolve(__dirname, "..");
const out = path.join(root, ".npm-cache", "vault-checks");
require("node:fs").mkdirSync(out, { recursive: true });
function compile(file, name) {
  const target = path.join(out, name + ".cjs");
  buildSync({ entryPoints: [path.join(root, file)], outfile: target, bundle: true, platform: "node" });
  return require(target);
}
process.env.ENCRYPTION_KEY = "0123456789abcdef".repeat(4);
const { generatePassword } = compile("src/utils/cryptoGenerator.ts", "generator");
const { encryptPassword, decryptPassword } = compile("src/utils/vaultCrypto.ts", "vault-crypto");
for (let i = 0; i < 100; i++) {
  const password = generatePassword();
  assert.equal(password.length, 20);
  assert(/[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password));
}
const onlyLower = generatePassword({ length: 12, includeUppercase: false, includeNumbers: false, includeSymbols: false });
assert(/^[a-z]{12}$/.test(onlyLower));
assert.throws(() => generatePassword({ includeUppercase: false, includeLowercase: false, includeNumbers: false, includeSymbols: false }));
const secret = "p@ss🔐word";
const encrypted = encryptPassword(secret);
assert.equal(decryptPassword(encrypted.ciphertext, encrypted.iv, encrypted.authTag), secret);
const badTag = Buffer.from(encrypted.authTag, "base64"); badTag[0] ^= 1;
assert.throws(() => decryptPassword(encrypted.ciphertext, encrypted.iv, badTag.toString("base64")));
assert.notEqual(encryptPassword(secret).iv, encrypted.iv);
console.log("PASS: generator categories/length, AES-GCM round-trip, tamper detection, and fresh IVs.");
