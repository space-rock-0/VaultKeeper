import "dotenv/config";
import { startPasswordEmailWorker } from "./services/passwordEmail.worker.ts";
import app from "./app.ts";
import { validateEncryptionKey } from "./utils/vaultCrypto.ts";

for (const name of ["DATABASE_URL", "ACCESS_TOKEN_SECRET", "REFRESH_TOKEN_SECRET"]) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

if (process.env.ACCESS_TOKEN_SECRET!.length < 32 || process.env.REFRESH_TOKEN_SECRET!.length < 32) {
  console.error("ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must each be at least 32 characters.");
  process.exit(1);
}
if (process.env.ACCESS_TOKEN_SECRET === process.env.REFRESH_TOKEN_SECRET) {
  console.error("Access and refresh token secrets must be different.");
  process.exit(1);
}

const proxyHops = process.env.TRUST_PROXY_HOPS;
if (proxyHops) {
  const hops = Number(proxyHops);
  if (!Number.isInteger(hops) || hops < 1) {
    console.error("TRUST_PROXY_HOPS must be a positive integer.");
    process.exit(1);
  }
  app.set("trust proxy", hops);
}

try {
  validateEncryptionKey();
} catch {
  console.error("ENCRYPTION_KEY must be configured as exactly 64 hexadecimal characters.");
  process.exit(1);
}

const port = Number(process.env.PORT || 5000);
const stopPasswordEmailWorker = startPasswordEmailWorker();
process.once("SIGTERM", stopPasswordEmailWorker);
process.once("SIGINT", stopPasswordEmailWorker);
app.listen(port, () => {
  console.log(`Auth API listening at http://localhost:${port}`);
});