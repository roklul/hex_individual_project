import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User, ROLES, RETIRED_MEMBER_EMAIL, hashPassword } from '../src/models/User.js';
import { upsertAdmin } from '../scripts/create-admin.js';

let db, server, base, signToken;
const password = randomBytes(24).toString('hex') + 'a1';
const newPassword = randomBytes(24).toString('hex') + 'b2';

before(async () => {
  db = await MongoMemoryServer.create();
  process.env.MONGODB_URI = db.getUri('sessions');
  process.env.JWT_SECRET = randomBytes(32).toString('hex');
  process.env.NODE_ENV = 'test';
  const { createApp } = await import('../src/app.js');
  ({ signToken } = await import('../src/utils/token.js'));
  await mongoose.connect(process.env.MONGODB_URI);
  await User.init();
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/api/auth`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await db?.stop();
});

function post(path, body) {
  return fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

function me(token) {
  return fetch(base + '/me', { headers: { Authorization: `Bearer ${token}` } });
}

function legacyToken(userId) {
  return jwt.sign({ sub: userId.toString() }, process.env.JWT_SECRET, { expiresIn: '5m', algorithm: 'HS256' });
}

test('原有一般帳號可延用舊 JWT，帳號升權或重設密碼後撤銷先前所有 JWT', async () => {
  const email = 'legacy-session@example.test';
  const { insertedId } = await User.collection.insertOne({ name: 'Legacy', email, password: await hashPassword(password), role: ROLES.USER });
  const originalToken = legacyToken(insertedId);
  assert.equal((await me(originalToken)).status, 200);
  const member = await (await post('/login', { email, password })).json();
  assert.equal((await me(member.data.token)).status, 200);

  await upsertAdmin({ email, password: newPassword });
  assert.equal((await me(originalToken)).status, 401);
  assert.equal((await me(member.data.token)).status, 401);
  assert.equal((await post('/login', { email, password })).status, 401);
  const admin = await (await post('/login', { email, password: newPassword })).json();
  assert.equal(admin.data.user.role, ROLES.ADMIN);
  assert.equal((await me(admin.data.token)).status, 200);

  await upsertAdmin({ email, password: newPassword });
  assert.equal((await me(admin.data.token)).status, 401);
  const refreshed = await (await post('/login', { email, password: newPassword })).json();
  assert.equal((await me(refreshed.data.token)).status, 200);
});

test('舊版管理員須重新登入以取得帶工作階段版本的 JWT', async () => {
  const email = 'legacy-admin@example.test';
  const { insertedId } = await User.collection.insertOne({ name: 'Admin', email, password: await hashPassword(password), role: ROLES.ADMIN });
  assert.equal((await me(legacyToken(insertedId))).status, 401);
  const current = await (await post('/login', { email, password })).json();
  assert.equal((await me(current.data.token)).status, 200);
});

test('同時重設密碼時，每次更新都會遞增工作階段版本', async () => {
  const email = 'concurrent-admin@example.test';
  const original = await upsertAdmin({ email, password });
  const resets = await Promise.all([
    upsertAdmin({ email, password: newPassword }),
    upsertAdmin({ email, password: newPassword }),
  ]);
  resets.sort((a, b) => a.sessionVersion - b.sessionVersion);
  assert.deepEqual(resets.map((user) => user.sessionVersion), [original.sessionVersion + 1, original.sessionVersion + 2]);
  assert.equal((await me(signToken(resets[0]))).status, 401);
  assert.equal((await me(signToken(resets[1]))).status, 200);
});

test('停用帳號保留 email，並拒絕舊資料庫中的登入與已簽發 JWT', async () => {
  const email = RETIRED_MEMBER_EMAIL.toUpperCase();
  assert.equal((await post('/register', { name: 'Retired', email, password })).status, 409);
  const old = await User.create({ name: 'Retired', email, password });
  assert.equal((await post('/login', { email, password })).status, 401);
  assert.equal((await me(legacyToken(old._id))).status, 401);
  assert.equal((await me(signToken(old))).status, 401);
  await assert.rejects(upsertAdmin({ email, password }), /已停用/);
});
