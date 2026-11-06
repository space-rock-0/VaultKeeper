const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const root = path.resolve(__dirname, "..");
const out = path.join(root, ".npm-cache", "auth-checks");
fs.mkdirSync(out, { recursive: true });
function load(source, name, define) {
  const target = path.join(out, name + ".cjs");
  buildSync({ entryPoints: [path.join(root, source)], outfile: target, bundle: true, platform: "node", packages: "external", define });
  return require(target);
}
let refreshCalls = 0;
let rejectRefresh = false;
function reject(config, status, data) {
  throw new axios.AxiosError("Request failed", "ERR_BAD_REQUEST", config, undefined, { status, data, config, headers: {}, statusText: "Rejected" });
}
axios.defaults.adapter = async (config) => {
  if (config.url === "/auth/refresh") {
    refreshCalls++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (rejectRefresh) return reject(config, 403, { message: "Forbidden" });
    return { status: 200, data: { accessToken: "fresh" }, config, headers: {}, statusText: "OK" };
  }
  if (config.url === "/auth/login") return reject(config, 401, { message: "Invalid credentials" });
  if (config.headers.get("Authorization") !== "Bearer fresh") return reject(config, 403, { code: "TOKEN_EXPIRED" });
  return { status: 200, data: { ok: true }, config, headers: {}, statusText: "OK" };
};
(async () => {
  const client = load("src/api/axios.ts", "axios", { "import.meta.env": JSON.stringify({ VITE_API_URL: "http://test.invalid/api" }) });
  await assert.rejects(client.api.post("/auth/login"), (e) => e.response.status === 401);
  assert.equal(refreshCalls, 0, "Invalid login must not refresh");
  client.setAccessToken("expired");
  await Promise.all(Array.from({ length: 5 }, () => client.api.get("/me")));
  assert.equal(refreshCalls, 1, "Concurrent expired access requests must share one refresh");
  const one = client.refreshAccessToken();
  const two = client.refreshAccessToken();
  assert.equal(one, two, "Strict Mode startup checks must share a promise");
  await Promise.all([one, two]);
  assert.equal(refreshCalls, 2);
  let logoutCount = 0;
  client.setLogoutCallback(() => { logoutCount++; });
  client.setAccessToken("expired-again");
  rejectRefresh = true;
  const failures = await Promise.allSettled(Array.from({ length: 3 }, () => client.api.get("/me")));
  assert(failures.every((r) => r.status === "rejected"));
  assert.equal(logoutCount, 1, "Refresh failure should clear auth once");
  process.env.ACCESS_TOKEN_SECRET = "integration-test-access-secret";
  process.env.REFRESH_TOKEN_SECRET = "integration-test-refresh-secret";
  const tokens = load("src/utils/tokens.ts", "tokens");
  const payload = { userId: "11111111-1111-4111-8111-111111111111", email: "test@example.invalid" };
  const first = tokens.generateRefreshToken(payload);
  const second = tokens.generateRefreshToken(payload);
  assert.notEqual(first, second, "Refresh JWTs must be unique even in the same second");
  const claims = jwt.verify(first, process.env.REFRESH_TOKEN_SECRET);
  assert.equal(claims.exp - claims.iat, 7 * 24 * 60 * 60);
  const access = jwt.verify(tokens.generateAccessToken(payload), process.env.ACCESS_TOKEN_SECRET);
  assert.equal(access.exp - access.iat, 15 * 60);
  assert.equal(tokens.hashToken("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const { authenticateToken } = load("src/middleware/auth.ts", "auth");
  const expired = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, { expiresIn: -1 });
  let status, body;
  const response = { status(value) { status = value; return this; }, json(value) { body = value; return this; } };
  authenticateToken({ headers: { authorization: `Bearer ${expired}` } }, response, () => assert.fail("Expired tokens must not pass"));
  assert.equal(status, 403);
  assert.equal(body.code, "TOKEN_EXPIRED");
  console.log("PASS: credential errors, refresh queue, startup deduplication, logout callback, token uniqueness/lifetimes/hash, and expired-token API contract.");
})().catch((error) => { console.error(error); process.exitCode = 1; });