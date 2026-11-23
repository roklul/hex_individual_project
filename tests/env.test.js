import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

test('正式環境拒絕空白與已公開的 JWT 金鑰，只接受自行設定的長密鑰', () => {
  const configUrl = new URL('../src/config/env.js', import.meta.url).href;
  function loadConfig(secret) {
    return spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(configUrl)})`], {
      env: { ...process.env, MONGODB_URI: 'mongodb://localhost/test', NODE_ENV: 'production', JWT_SECRET: secret },
    }).status;
  }
  for (const value of ['', ' '.repeat(40), 'short', 'change-me-to-a-long-random-string', 'dev-only-secret-not-for-production-use-0123456789']) {
    assert.equal(loadConfig(value), 1);
  }
  assert.equal(loadConfig(randomBytes(32).toString('hex')), 0);
});
