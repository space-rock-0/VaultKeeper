CREATE TYPE "RenewalInterval" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY', 'CUSTOM');

CREATE TABLE "PasswordVault" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "siteName" TEXT NOT NULL,
  "siteUrl" TEXT,
  "username" TEXT NOT NULL,
  "encryptedPassword" TEXT NOT NULL,
  "iv" TEXT NOT NULL,
  "authTag" TEXT NOT NULL,
  "renewalInterval" "RenewalInterval" NOT NULL DEFAULT 'MONTHLY',
  "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PasswordVault_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PasswordVault_userId_idx" ON "PasswordVault"("userId");
CREATE INDEX "PasswordVault_expiresAt_idx" ON "PasswordVault"("expiresAt");

ALTER TABLE "PasswordVault" ADD CONSTRAINT "PasswordVault_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
