import { prisma } from "../db/prisma";
import { decryptPassword } from "../utils/vaultCrypto";
import { assertEmailConfigured, sendOtpEmail } from "./email.service";

/** PostgreSQL leases coordinate workers across instances. Expired leases recover after a crash. */
export async function deliverNextPasswordEmail(): Promise<boolean> {
  assertEmailConfigured();
  const item = await prisma.$transaction(async (tx) => {
    const selected = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "PasswordEmail"
      WHERE "expiresAt" > NOW() AND "attempts" < 5 AND "nextAttemptAt" <= NOW()
      AND ("leaseUntil" IS NULL OR "leaseUntil" < NOW()) ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!selected[0]) return null;
    return tx.passwordEmail.update({ where: { id: selected[0].id }, data: {
      attempts: { increment: 1 }, leaseUntil: new Date(Date.now() + 60000),
    }, include: { challenge: { include: { user: { select: { email: true } } } } } });
  });
  if (!item) return false;
  let code = "";
  try {
    if (item.challenge.consumedAt || item.challenge.verifiedAt || item.challenge.expiresAt <= new Date()) {
      await prisma.passwordEmail.deleteMany({ where: { id: item.id } });
      return true;
    }
    code = decryptPassword(item.ciphertext, item.iv, item.authTag);
    await sendOtpEmail(item.challenge.user.email, code, item.id);
    await prisma.passwordEmail.deleteMany({ where: { id: item.id } });
  } catch {
    // No recipient, code, provider error, or credentials are logged.
    console.error("Password email delivery attempt failed.");
    await prisma.passwordEmail.updateMany({ where: { id: item.id }, data: {
      leaseUntil: null, nextAttemptAt: new Date(Date.now() + Math.min(120000, 5000 * 2 ** item.attempts)),
    } });
  } finally { code = ""; }
  return true;
}

export function startPasswordEmailWorker(): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      assertEmailConfigured();
      // Delete spent material, including codes whose delivery exhausted its retries.
      await prisma.passwordEmail.deleteMany({ where: { expiresAt: { lte: new Date() } } });
      for (let count = 0; count < 10 && await deliverNextPasswordEmail(); count++) { /* bounded drain */ }
    } catch { /* Missing mail configuration or a transient DB outage never stops the API. */ }
    finally { running = false; }
  };
  const timer = setInterval(() => void tick(), 5000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
