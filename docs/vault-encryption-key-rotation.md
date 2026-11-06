# Rotating the vault encryption key

Vault ciphertexts written before key versioning use the unprefixed format and are read with key version 1. New version 1 ciphertexts keep that format for backward compatibility. Ciphertexts written with later keys carry a `vN:` prefix.

Keep keys in your deployment secret manager. Do not commit keys or paste them into logs. Generate a 32-byte key locally with:

```sh
node -p "require('node:crypto').randomBytes(32).toString('hex')"
```

To move from version 1 to version 2, deploy the version-aware server first with these secrets configured on every API instance:

```dotenv
ENCRYPTION_KEY_V1=<current 64-character version 1 key>
ENCRYPTION_KEY_V2=<new 64-character version 2 key>
ENCRYPTION_KEY_VERSION=2
```

If the old key is currently named `ENCRYPTION_KEY`, copy its value into `ENCRYPTION_KEY_V1` before changing or removing it. Keep both keys available while old rows are being re-encrypted. The application starts writing version 2 ciphertexts once version 2 is active.

Run the resumable, compare-and-set rotation command:

```sh
npm run vault:rotate-key
```

It processes records in batches, does not print plaintext, and skips rows that changed concurrently. Re-run it if entries were skipped. Confirm no old ciphertext remains before removing the old key:

```sql
SELECT COUNT(*) AS remaining
FROM "PasswordVault"
WHERE "encryptedPassword" NOT LIKE 'v2:%';
```

Remove `ENCRYPTION_KEY_V1` (and the legacy `ENCRYPTION_KEY`, if present) only after the count is zero and every API instance is running the version-aware code. Preserve the new key as `ENCRYPTION_KEY_V2` and keep `ENCRYPTION_KEY_VERSION=2`.
