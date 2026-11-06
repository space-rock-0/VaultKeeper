const path = require("node:path");
const { buildSync } = require("esbuild");

const root = path.resolve(__dirname, "..");
try {
  require("@prisma/client");
} catch {
  console.error("Prisma Client has not been generated. Run: npm run db:generate");
  process.exit(1);
}

const output = path.join(root, "dist-server", "server.cjs");
buildSync({
  entryPoints: [path.join(root, "src", "server.ts")],
  bundle: true,
  platform: "node",
  packages: "external",
  outfile: output,
});
require(output);