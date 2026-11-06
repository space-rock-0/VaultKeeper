-- Protect AES-GCM nonce uniqueness. The index may already exist if Neon was
-- migrated through the Neon branch workflow before Prisma records this migration.
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordVault_iv_key" ON "PasswordVault"("iv");
