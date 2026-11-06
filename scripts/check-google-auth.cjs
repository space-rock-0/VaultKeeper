const assert = require('node:assert/strict');
const path = require('node:path');
const { build } = require('esbuild');
const root = path.resolve(__dirname, '..');
const outfile = path.join(root, '.npm-cache', 'google-controller-check.cjs');
process.env.ACCESS_TOKEN_SECRET = 'test-access-secret-that-is-at-least-32-characters';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-that-is-at-least-32-characters';
(async()=> {
await build({ entryPoints: [path.join(root, 'src/controllers/auth.controller.ts')], outfile, bundle: true, platform: 'node', packages: 'external', plugins: [{ name: 'isolated-google-and-database', setup(build) {
  build.onResolve({ filter: /^google-auth-library$/ }, () => ({ path: 'google', namespace: 'test' }));
  build.onResolve({ filter: /db\/prisma$/ }, () => ({ path: 'prisma', namespace: 'test' }));
  build.onLoad({ filter: /.*/, namespace: 'test' }, ({path: name}) => ({ contents: name === 'google'
    ? 'export class OAuth2Client { async verifyIdToken(options) { return globalThis.googleTest.verify(options); } }'
    : 'export const prisma = new Proxy({}, { get: (_, key) => globalThis.googleTest.db[key] });', loader: 'js' }));
} }] });
const { googleLogin, login } = require(outfile);
function response() { return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, cookie(name, value, options) { this.savedCookie = { name, value, options }; return this; } }; }

  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'new@example.invalid', googleId: 'google-subject', passwordHash: null, authVersion: 0 };
  let refresh;
  globalThis.googleTest = { verify: async (options) => { assert.equal(options.audience, 'test-client'); assert.equal(options.idToken, 'credential'); return { getPayload: () => ({ sub: user.googleId, email: user.email, email_verified: true }) }; }, db: { user: { findUnique: async ({where}) => where.id ? user : null, create: async ({data}) => { assert.equal(data.googleId, user.googleId); assert.equal(data.passwordHash, undefined); return user; } }, refreshToken: { create: async ({data}) => { refresh = data; } } } };
  globalThis.googleTest.db.$transaction = async (fn) => fn({ ...globalThis.googleTest.db, $queryRaw: async () => [] });
  let res = response(); delete process.env.GOOGLE_CLIENT_ID;
  await googleLogin({body:{credential:'credential'}},res); assert.equal(res.statusCode,503);
  process.env.GOOGLE_CLIENT_ID='test-client';
  res=response(); await googleLogin({body:{}},res); assert.equal(res.statusCode,400);
  res=response(); await googleLogin({body:{credential:'credential'}},res); assert.equal(res.statusCode,200); assert(res.body.accessToken); assert(res.savedCookie.options.httpOnly); assert.equal(res.savedCookie.options.sameSite,'strict'); assert.equal(refresh.token.length,64); assert.notEqual(refresh.token,res.savedCookie.value);
  globalThis.googleTest.db.user.findUnique=async ({where}) => where.email ? {...user, googleId:null, passwordHash:'local-password-hash'} : null;
  res=response(); await googleLogin({body:{credential:'credential'}},res); assert.equal(res.statusCode,409); assert.equal(res.savedCookie,undefined);
  globalThis.googleTest.db.user.findUnique=async()=>user;
  res=response(); await login({body:{email:user.email,password:'not-a-password'}},res); assert.equal(res.statusCode,401); assert.equal(res.body.code,'GOOGLE_OAUTH_REQUIRED');
  globalThis.googleTest.verify=async () => { throw new Error('invalid credential'); };
  res=response(); await googleLogin({body:{credential:'credential'}},res); assert.equal(res.statusCode,401); assert.equal(res.savedCookie,undefined);
  globalThis.googleTest.verify=async () => ({ getPayload:()=>({sub:'subject',email:user.email,email_verified:false}) });
  res=response(); await googleLogin({body:{credential:'credential'}},res); assert.equal(res.statusCode,401);
  console.log('PASS: Google configuration/input failures, audience contract, successful session/cookie/hash, local-account collision protection, rejected credentials and unverified email. Google SDK cryptography is not mocked as verified by these checks.');
})().catch(error=>{console.error(error);process.exitCode=1;});
