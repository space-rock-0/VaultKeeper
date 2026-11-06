-- Idempotent so Prisma can register an identical schema already staged/applied through Neon.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "authVersion" INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);
DO $$ BEGIN CREATE TYPE "PasswordChallengePurpose" AS ENUM ('RECOVERY', 'SET_PASSWORD'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS "PasswordChallenge" (
 "id" UUID NOT NULL, "userId" UUID NOT NULL, "purpose" "PasswordChallengePurpose" NOT NULL,
 "otpHash" TEXT NOT NULL, "failedAttempts" INTEGER NOT NULL DEFAULT 0,
 "expiresAt" TIMESTAMP(3) NOT NULL, "lastSentAt" TIMESTAMP(3) NOT NULL,
 "verifiedAt" TIMESTAMP(3), "grantHash" TEXT, "grantExpiresAt" TIMESTAMP(3), "consumedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "PasswordChallenge_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "PasswordChallenge_attempts_check" CHECK ("failedAttempts" BETWEEN 0 AND 3),
 CONSTRAINT "PasswordChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordChallenge_userId_purpose_key" ON "PasswordChallenge"("userId", "purpose");
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordChallenge_grantHash_key" ON "PasswordChallenge"("grantHash");
CREATE INDEX IF NOT EXISTS "PasswordChallenge_expiresAt_idx" ON "PasswordChallenge"("expiresAt");

CREATE TABLE IF NOT EXISTS "PasswordEmail" (
 "id" UUID NOT NULL, "challengeId" UUID NOT NULL, "ciphertext" TEXT NOT NULL, "iv" TEXT NOT NULL, "authTag" TEXT NOT NULL,
 "attempts" INTEGER NOT NULL DEFAULT 0, "expiresAt" TIMESTAMP(3) NOT NULL, "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "leaseUntil" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PasswordEmail_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "PasswordEmail_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "PasswordChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PasswordEmail_nextAttemptAt_idx" ON "PasswordEmail"("nextAttemptAt");
