import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';

const source = fs.readFileSync(new URL('../supabase/functions/send-reminder-notifications/index.ts', import.meta.url), 'utf8').replace(/^import \{ createClient \} from .*;$/m, '');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const configuredSecret = 'a'.repeat(64);
const defaults = { REMINDER_CRON_SECRET: configuredSecret, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key', FCM_PROJECT_ID: 'test-project', FCM_SERVICE_ACCOUNT_JSON: 'test-account' };
let handler;
let env;
let created;
let fetchCalls;
let database;
let fetchImpl;
const logs = [];
const context = vm.createContext({
  Deno: { env: { get: (key) => env[key] }, serve: (callback) => { handler = callback; } },
  createClient: () => {
    created++;
    return { from: (table) => {
      const builder = { select: () => builder, gte: () => builder, lt: () => builder, in: () => builder, abortSignal: () => Promise.resolve(database[table]) };
      return builder;
    } };
  },
  crypto: webcrypto, TextEncoder, Uint8Array, Date, Map, Set, JSON, String, Error, Response, AbortSignal, atob, btoa,
  fetch: async (...args) => { fetchCalls++; return fetchImpl(...args); },
  console: { error: (...args) => logs.push(args) },
});
vm.runInContext(code, context);
function reset(override = {}) {
  env = { ...defaults, ...override };
  created = 0;
  fetchCalls = 0;
  database = { zen_reminders: { data: [], error: null }, push_tokens: { data: [], error: null } };
  fetchImpl = async () => { throw new Error('unexpected fetch'); };
}
const call = (method = 'POST', secret = configuredSecret) => handler(new Request('https://example.test', { method, headers: secret == null ? {} : { 'x-reminder-cron-secret': secret } }));
reset();
assert.equal((await call('GET')).status, 405);
assert.equal(created, 0);
for (const secret of [null, 'wrong', 'legacy-anon-key']) {
  reset();
  assert.equal((await call('POST', secret)).status, 401);
  assert.equal(created, 0);
  assert.equal(fetchCalls, 0);
}
for (const secret of [undefined, '', 'short']) {
  reset({ REMINDER_CRON_SECRET: secret });
  assert.equal((await call()).status, 503);
  assert.equal(created, 0);
}
reset({ FCM_PROJECT_ID: undefined });
assert.equal((await call()).status, 503);
assert.equal(created, 0);
reset();
let response = await call();
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { sent: 0 });
assert.equal(created, 1);
assert.equal(fetchCalls, 0);
reset();
database.zen_reminders = { data: null, error: { message: 'private database contents' } };
response = await call();
assert.equal(response.status, 500);
assert.ok(!(await response.text()).includes('private'));

const keyPair = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const privateKey = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', keyPair.privateKey)).toString('base64');
const serviceAccount = btoa(JSON.stringify({ client_email: 'test@example.test', private_key: `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----` }));
function withDelivery() {
  reset({ FCM_SERVICE_ACCOUNT_JSON: serviceAccount });
  database.zen_reminders = { data: [{ id: 'reminder', user_id: 'user', title: 'Private title', description: 'Private description' }], error: null };
  database.push_tokens = { data: [{ user_id: 'user', token: 'private-device-token' }], error: null };
}
withDelivery();
fetchImpl = async () => new Response('{"error":"private OAuth detail"}', { status: 403 });
response = await call();
assert.equal(response.status, 500);
assert.equal(fetchCalls, 1);
assert.ok(!(await response.text()).includes('private'));
withDelivery();
fetchImpl = async () => Response.json({ token_type: 'Bearer' });
assert.equal((await call()).status, 500);
assert.equal(fetchCalls, 1);
withDelivery();
fetchImpl = async () => fetchCalls === 1 ? Response.json({ access_token: 'test-access-token' }) : new Response('{"error":"private provider detail"}', { status: 400 });
response = await call();
assert.equal(response.status, 502);
assert.deepEqual(await response.json(), { error: 'Some reminder notifications could not be sent', sent: 0, failed: 1 });
withDelivery();
fetchImpl = async () => fetchCalls === 1 ? Response.json({ access_token: 'test-access-token' }) : Response.json({});
assert.equal((await call()).status, 502);
withDelivery();
fetchImpl = async () => fetchCalls === 1 ? Response.json({ access_token: 'test-access-token' }) : Response.json({ name: 'projects/test-project/messages/success' });
response = await call();
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { sent: 1 });
assert.ok(!JSON.stringify(logs).includes('private'));
console.log('Scheduler regression checks passed: methods, auth/config rejection before privileged access, no-op dispatch, error redaction, OAuth validation, FCM rejection and confirmed success.');
