import { prisma } from "../src/db/prisma";
import {
  decryptPassword,
  encryptPassword,
  getActiveEncryptionKeyVersion,
  getCiphertextKeyVersion,
} from "../src/utils/vaultCrypto";

async function rotateVaultEncryptionKey(): Promise<void> {
  const activeVersion = getActiveEncryptionKeyVersion();
  let cursor: string | undefined;
  let rotated = 0;
  let skipped = 0;

  try {
    for (;;) {
      const rows = await prisma.passwordVault.findMany({
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: "asc" },
        select: { id: true, encryptedPassword: true, iv: true, authTag: true },
      });
      if (!rows.length) break;

      for (const row of rows) {
        cursor = row.id;
        if (getCiphertextKeyVersion(row.encryptedPassword) === activeVersion) continue;
        let plaintext = decryptPassword(row.encryptedPassword, row.iv, row.authTag);
        try {
          const encrypted = encryptPassword(plaintext);
          const result = await prisma.passwordVault.updateMany({
            where: { id: row.id, encryptedPassword: row.encryptedPassword },
            data: { encryptedPassword: encrypted.ciphertext, iv: encrypted.iv, authTag: encrypted.authTag },
          });
          if (result.count) rotated += 1;
          else skipped += 1; // Another request changed this row while rotation was running.
        } finally {
          plaintext = "";
        }
      }
      if (rows.length < 100) break;
    }
    console.log(`Vault key rotation complete. Re-encrypted ${rotated} entries; skipped ${skipped} changed entries.`);
  } catch {
    console.error("Vault key rotation stopped. No plaintext was logged; rerun after fixing the key configuration.");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void rotateVaultEncryptionKey();
