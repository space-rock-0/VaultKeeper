const assert = require('node:assert/strict');
const path = require('node:path');
const { build } = require('esbuild');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const root = path.resolve(__dirname, '..');
process.env.OTP_HASH_SECRET = 'test-otp-secret-at-least-thirty-two-characters';
process.env.ENCRYPTION_KEY = '0123456789abcdef'.repeat(4);
process.env.ACCESS_TOKEN_SECRET = 'test-access-secret-at-least-thirty-two-characters';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-at-least-thirty-two-characters';
const userId = '11111111-1111-4111-8111-111111111111';
let state = { user: { id:userId, email:'test@example.invalid', passwordHash:null, googleId:'google-subject', authVersion:0 }, challenges:[], emails:[], tokens:[{userId,token:'previous-session'}] };
function match(row, where = {}) {
  return Object.entries(where).every(([key,value]) => {
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('equals' in value) return String(row[key]).toLowerCase() === value.equals.toLowerCase();
      if ('increment' in value) throw new Error('increment is not a predicate');
      if ('not' in value) return row[key] !== value.not;
      if ('gt' in value) return row[key] != null && row[key] > value.gt;
      if ('lte' in value) return row[key] <= value.lte;
      if (key === 'userId_purpose') return row.userId === value.userId && row.purpose === value.purpose;
    }
    return row[key] === value;
  });
}
function patch(row, data) {
  for (const [key,value] of Object.entries(data)) row[key] = value && typeof value === 'object' && 'increment' in value ? row[key] + value.increment : value;
  row.updatedAt = new Date(); return structuredClone(row);
}
function model(name) { return {
  findUnique: async ({where}) => structuredClone(state[name].find(row => match(row,where)) ?? null),
  findFirst: async ({where,orderBy}) => { const rows=state[name].filter(row=>match(row,where)); if(orderBy?.lastSentAt) rows.sort((a,b)=>b.lastSentAt-a.lastSentAt); return structuredClone(rows[0]??null); },
  create: async ({data}) => { const row={id:require('node:crypto').randomUUID(),attempts:0, ...data};state[name].push(row);return structuredClone(row); },
  upsert: async ({where,create,update}) => { const row=state[name].find(row=>match(row,where)); if(row) return patch(row,update); state[name].push(structuredClone(create));return structuredClone(create); },
  update: async ({where,data,include}) => { const row=state[name].find(row=>match(row,where));assert(row);const result=patch(row,data);if(include?.challenge) result.challenge={...state.challenges.find(c=>c.id===row.challengeId),user:{email:state.user.email}};return result; },
  updateMany: async ({where,data}) => { const rows=state[name].filter(row=>match(row,where)); rows.forEach(row=>patch(row,data));return {count:rows.length}; },
  deleteMany: async ({where}) => { const rows=state[name].filter(row=>match(row,where));state[name]=state[name].filter(row=>!match(row,where));return {count:rows.length}; },
}; }
let tail=Promise.resolve(); let locks=0;
const db={
  user:{ findFirst:async ({where})=>match(state.user,where)?structuredClone(state.user):null,findUnique:async ({where})=>match(state.user,where)?structuredClone(state.user):null,update:async ({data})=>patch(state.user,data) },
  passwordChallenge:model('challenges'),passwordEmail:model('emails'),refreshToken:model('tokens'),
  $queryRaw:async (strings) => { locks++;if(strings[0].includes('PasswordEmail'))return state.emails.filter(e=>e.expiresAt>new Date()&&e.attempts<5&&(!e.nextAttemptAt||e.nextAttemptAt<=new Date())).slice(0,1).map(e=>({id:e.id}));return [{id:userId}]; },
  $transaction: async fn => { const prior=tail;let release;tail=new Promise(resolve=>{release=resolve;});await prior;const before=structuredClone(state);try{return await fn(db);}catch(error){state=before;throw error;}finally{release();} },
};
globalThis.passwordTest={ db, send:async()=>{} };
(async()=>{
  const output=path.join(root,'.npm-cache','password-security-check.cjs');
  await build({stdin:{contents:`export * from './src/services/password.service'; export * from './src/utils/passwordSecurity'; export * from './src/utils/vaultCrypto'; export * from './src/emails/otpEmail'; export * from './src/services/passwordEmail.worker'; export {authenticateToken} from './src/middleware/auth';`,resolveDir:root,loader:'ts'},outfile:output,bundle:true,platform:'node',packages:'external',plugins:[{name:'isolated-storage-and-mail',setup(build){
    build.onResolve({filter:/db\/prisma$/},()=>({path:'db',namespace:'test'}));
    build.onResolve({filter:/email.service$/},()=>({path:'email',namespace:'test'}));
    build.onLoad({filter:/.*/,namespace:'test'},({path:name})=>({contents:name==='db'?'export const prisma=globalThis.passwordTest.db;':'export const assertEmailConfigured=()=>{}; export const sendOtpEmail=(...args)=>globalThis.passwordTest.send(...args);',loader:'js'}));
  }}]});
  const service=require(output);
  const {requestPasswordCode:request,verifyPasswordCode:verify,completePasswordCode:complete,changePassword:change}=service;
  for(let i=0;i<100;i++) assert(/^\d{6}$/.test(service.generateOtp()));
  assert.notEqual(service.hashOtp('a','RECOVERY','123456'),service.hashOtp('b','RECOVERY','123456'));
  assert(service.otpEmail('123456').html.includes('letter-spacing'));
  assert.throws(()=>service.otpEmail('<script>'));
  const unknown1=await request('absent@example.invalid','RECOVERY');const unknown2=await request('absent@example.invalid','RECOVERY');assert.equal(unknown1.challengeId,unknown2.challengeId);assert.equal(state.emails.length,0);
  const pending=await request(state.user.email,'RECOVERY');assert.equal(state.emails.length,1);
  let encrypted=state.emails[0];let code=service.decryptPassword(encrypted.ciphertext,encrypted.iv,encrypted.authTag);
  assert.equal(state.challenges[0].otpHash,service.hashOtp(pending.challengeId,'RECOVERY',code));assert(!JSON.stringify(state).includes('"'+code+'"'));
  await request(state.user.email,'RECOVERY');assert.equal(state.emails.length,1);assert.equal(state.emails[0].id,encrypted.id);
  const wrong=code==='000000'?'000001':'000000';
  const guesses=await Promise.allSettled(Array.from({length:6},()=>verify(pending.challengeId,wrong,'RECOVERY')));assert(guesses.every(result=>result.status==='rejected'));assert.equal(state.challenges[0].failedAttempts,3);
  await assert.rejects(verify(pending.challengeId,code,'RECOVERY'));
  state.challenges[0].lastSentAt=new Date(Date.now()-61000);await request(state.user.email,'RECOVERY');assert.equal(state.challenges[0].failedAttempts,3,'Resend cannot erase lockout');
  state.challenges[0].expiresAt=new Date(Date.now()-1);await request(state.user.email,'RECOVERY');assert.equal(state.challenges[0].failedAttempts,0);
  encrypted=state.emails[0];code=service.decryptPassword(encrypted.ciphertext,encrypted.iv,encrypted.authTag);
  let deliveries=0;globalThis.passwordTest.send=async (to,otp,id)=>{deliveries++;assert.equal(to,state.user.email);assert.equal(otp,code);assert.equal(id,encrypted.id);if(deliveries===1)throw new Error('simulated provider outage');};
  await service.deliverNextPasswordEmail();assert.equal(state.emails.length,1);assert.equal(state.emails[0].attempts,1);state.emails[0].nextAttemptAt=new Date(Date.now()-1);await service.deliverNextPasswordEmail();assert.equal(state.emails.length,0);assert.equal(deliveries,2);
  const grant=await verify(pending.challengeId,code,'RECOVERY');assert.equal(grant.length,64);assert.notEqual(state.challenges[0].grantHash,grant);await assert.rejects(verify(pending.challengeId,code,'RECOVERY'));
  await assert.rejects(complete(grant,'strong-new-password!','SET_PASSWORD',userId));await assert.rejects(complete(grant,'short','RECOVERY'));
  const winners=await Promise.allSettled([complete(grant,'strong-new-password!','RECOVERY'),complete(grant,'strong-new-password!','RECOVERY')]);assert.equal(winners.filter(r=>r.status==='fulfilled').length,1);assert.equal(state.user.authVersion,1);assert(await bcrypt.compare('strong-new-password!',state.user.passwordHash));assert(state.user.passwordChangedAt instanceof Date);assert.equal(state.tokens.length,1);assert.equal(state.tokens[0].token.length,64);assert.equal(state.challenges[0].grantHash,null);
  await assert.rejects(complete(grant,'another-strong-password!','RECOVERY'));await assert.rejects(change(userId,'incorrect','another-strong-password!'));
  const updated=await change(userId,'strong-new-password!','another-strong-password!');assert.equal(state.user.authVersion,2);assert(updated.user.hasPassword);assert.equal(state.tokens.length,1);
  function response(){return {statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;}};}
  const expiredVersion=jwt.sign({userId,email:state.user.email,authVersion:0},process.env.ACCESS_TOKEN_SECRET,{expiresIn:'15m'});let res=response();await service.authenticateToken({headers:{authorization:'Bearer '+expiredVersion}},res,()=>assert.fail('Revoked token passed'));assert.equal(res.body.code,'SESSION_REVOKED');
  let passed=false;res=response();await service.authenticateToken({headers:{authorization:'Bearer '+updated.accessToken}},res,()=>{passed=true;});assert(passed);assert(locks>0);
  // A restricted reset grant is not a regular access JWT.
  res=response();await service.authenticateToken({headers:{authorization:'Bearer '+grant}},res,()=>assert.fail('Reset grant passed as access token'));assert.equal(res.body.code,'INVALID_ACCESS_TOKEN');
  state.user.passwordHash=null;state.challenges=[];state.emails=[];
  const settings=await request(state.user.email,'SET_PASSWORD',userId);
  encrypted=state.emails[0];code=service.decryptPassword(encrypted.ciphertext,encrypted.iv,encrypted.authTag);
  await assert.rejects(verify(settings.challengeId,code,'SET_PASSWORD','22222222-2222-4222-8222-222222222222'));
  await assert.rejects(verify(settings.challengeId,code,'RECOVERY'));
  state.challenges[0].expiresAt=new Date(Date.now()-1);await assert.rejects(verify(settings.challengeId,code,'SET_PASSWORD',userId));
  state.challenges[0].lastSentAt=new Date(Date.now()-61000);await request(state.user.email,'SET_PASSWORD',userId);
  encrypted=state.emails[0];code=service.decryptPassword(encrypted.ciphertext,encrypted.iv,encrypted.authTag);
  const expiredGrant=await verify(settings.challengeId,code,'SET_PASSWORD',userId);state.challenges[0].grantExpiresAt=new Date(Date.now()-1);
  await assert.rejects(complete(expiredGrant,'oauth-new-password!','SET_PASSWORD',userId));assert.equal(state.user.passwordHash,null);
  state.challenges[0].lastSentAt=new Date(Date.now()-61000);await request(state.user.email,'SET_PASSWORD',userId);
  encrypted=state.emails[0];code=service.decryptPassword(encrypted.ciphertext,encrypted.iv,encrypted.authTag);
  const settingsGrant=await verify(settings.challengeId,code,'SET_PASSWORD',userId);
  await assert.rejects(complete(settingsGrant,'oauth-new-password!','SET_PASSWORD','22222222-2222-4222-8222-222222222222'));
  const setup=await complete(settingsGrant,'oauth-new-password!','SET_PASSWORD',userId);assert(setup.user.hasPassword);assert(setup.user.googleLinked);assert(await bcrypt.compare('oauth-new-password!',state.user.passwordHash));
  await assert.rejects(request(state.user.email,'SET_PASSWORD',userId));
  console.log('PASS: OTP generation/hashing, non-enumerating request IDs, encrypted durable email/retry, cooldown, concurrent 3-attempt limit, persistent lockout, single-use OTP/grants, purpose binding, password hashing, session revocation, authenticated password updates. Storage/mail are isolated test doubles.');
})().catch(error=>{console.error(error);process.exitCode=1;});
