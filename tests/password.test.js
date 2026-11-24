import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let db, server, base, outbox, User;
const GENERIC = /如果這個 Email 已註冊/;

before(async () => {
  db = await MongoMemoryServer.create();
  process.env.MONGODB_URI = db.getUri('password');
  process.env.JWT_SECRET = 'test-secret-0123456789-0123456789-abcdef';
  process.env.NODE_ENV = 'test';
  process.env.APP_URL = 'https://shop.example.test';
  delete process.env.RESEND_API_KEY;
  const { createApp } = await import('../src/app.js');
  ({ outbox } = await import('../src/utils/mailer.js'));
  ({ User } = await import('../src/models/User.js'));
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

async function call(method, path, body, token) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

/** 寄信在回應之後才進行，等待信件出現在測試信箱 */
async function waitForMail(to, count) {
  for (let i = 0; i < 50; i++) {
    const mails = outbox.filter((m) => m.to === to);
    if (mails.length >= count) return mails[count - 1];
    await sleep(20);
  }
  return null;
}
const tokenFrom = (mail) => mail.text.match(/reset-password\?token=([\w-]+)/)[1];

test('忘記密碼：不洩漏帳號是否存在，連結一次性、30 分鐘內有效，重設後舊登入全部失效', async () => {
  const email = 'forgot@example.test';
  const reg = await call('POST', '/register', { name: '忘記', email, password: 'OldPass123' });
  const oldJwt = reg.json.data.token;

  // 未註冊與已註冊的 Email 回應完全相同
  const unknown = await call('POST', '/forgot-password', { email: 'nobody@example.test' });
  const known = await call('POST', '/forgot-password', { email: email.toUpperCase() });
  assert.equal(unknown.status, 200);
  assert.deepEqual(unknown.json, known.json);
  assert.match(known.json.message, GENERIC);
  assert.equal((await call('POST', '/forgot-password', { email: 'bad' })).status, 400);

  const mail = await waitForMail(email, 1);
  assert.ok(mail, '應寄出重設信');
  assert.match(mail.text, /^[\s\S]*https:\/\/shop\.example\.test\/reset-password\?token=/);
  assert.equal(outbox.some((m) => m.to === 'nobody@example.test'), false);
  const token = tokenFrom(mail);

  // 資料庫只存雜湊
  const stored = await User.findOne({ email }).select('+passwordReset.tokenHash').lean();
  assert.notEqual(stored.passwordReset.tokenHash, token);

  // 60 秒內重複申請不再寄信，原連結仍有效
  await call('POST', '/forgot-password', { email });
  await sleep(100);
  assert.equal(outbox.filter((m) => m.to === email).length, 1);

  assert.equal((await call('POST', '/reset-password', { token: 'x'.repeat(43), password: 'NewPass123' })).status, 400);
  assert.equal((await call('POST', '/reset-password', { token, password: 'weak' })).status, 400);
  assert.equal((await call('POST', '/reset-password', { token, password: 'NewPass123', role: 'admin' })).status, 400);

  const reset = await call('POST', '/reset-password', { token, password: 'NewPass123' });
  assert.equal(reset.status, 200);
  assert.equal(reset.json.data.user.email, email);
  assert.equal((await call('GET', '/me', null, reset.json.data.token)).status, 200);
  assert.equal((await call('GET', '/me', null, oldJwt)).status, 401);
  assert.equal((await call('POST', '/login', { email, password: 'OldPass123' })).status, 401);
  assert.equal((await call('POST', '/login', { email, password: 'NewPass123' })).status, 200);

  // 同一連結不能再用第二次
  assert.equal((await call('POST', '/reset-password', { token, password: 'Another123' })).status, 400);

  // 過期的連結無效
  await User.updateOne({ email }, { $set: { 'passwordReset.requestedAt': new Date(0) } });
  await call('POST', '/forgot-password', { email });
  const expiredToken = tokenFrom(await waitForMail(email, 2));
  await User.updateOne({ email }, { $set: { 'passwordReset.expiresAt': new Date(Date.now() - 1000) } });
  assert.equal((await call('POST', '/reset-password', { token: expiredToken, password: 'Another123' })).status, 400);
});

test('修改密碼：需驗證目前密碼，成功後換發新憑證並登出其他裝置', async () => {
  const email = 'change@example.test';
  const reg = await call('POST', '/register', { name: '改密碼', email, password: 'OldPass123' });
  const deviceA = reg.json.data.token;
  const deviceB = (await call('POST', '/login', { email, password: 'OldPass123' })).json.data.token;

  assert.equal((await call('PATCH', '/password', { currentPassword: 'OldPass123', newPassword: 'NewPass123' })).status, 401);
  let r = await call('PATCH', '/password', { currentPassword: 'Wrong1234', newPassword: 'NewPass123' }, deviceA);
  assert.equal(r.status, 400);
  assert.match(r.json.message, /目前的密碼不正確/);
  r = await call('PATCH', '/password', { currentPassword: 'OldPass123', newPassword: 'OldPass123' }, deviceA);
  assert.equal(r.status, 400);
  r = await call('PATCH', '/password', { currentPassword: 'OldPass123', newPassword: 'short' }, deviceA);
  assert.equal(r.status, 400);

  r = await call('PATCH', '/password', { currentPassword: 'OldPass123', newPassword: 'NewPass123' }, deviceA);
  assert.equal(r.status, 200);
  const renewed = r.json.data.token;
  assert.equal((await call('GET', '/me', null, renewed)).status, 200);
  assert.equal((await call('GET', '/me', null, deviceA)).status, 401);
  assert.equal((await call('GET', '/me', null, deviceB)).status, 401);
  assert.equal((await call('POST', '/login', { email, password: 'NewPass123' })).status, 200);
});
