import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod, server, base, mongoose;
let userToken, adminToken, productId, soldOutId, lowStockId;

const api = async (method, path, { token, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
};

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('test');
  process.env.JWT_SECRET = 'test-secret-0123456789-0123456789-abcdef';
  process.env.NODE_ENV = 'test';
  mongoose = (await import('mongoose')).default;
  const { createApp } = await import('../src/app.js');
  const { runSeed } = await import('../scripts/seed.js');
  const { upsertAdmin } = await import('../scripts/create-admin.js');
  await mongoose.connect(process.env.MONGODB_URI);
  await runSeed();
  await upsertAdmin({ email: 'admin@test.local', password: 'Admin1234' });
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  server?.close();
  await mongoose?.disconnect();
  await mongod?.stop();
});

test('註冊：不能夾帶 role 提權', async () => {
  const r = await api('POST', '/auth/register', { body: { name: 'Hacker', email: 'h@x.com', password: 'abc12345', role: 'admin' } });
  assert.equal(r.status, 400);
});

test('註冊 / 登入 / me', async () => {
  let r = await api('POST', '/auth/register', { body: { name: 'Amy', email: 'Amy@Example.com', password: 'abc12345' } });
  assert.equal(r.status, 201);
  assert.equal(r.json.data.user.role, 'user');
  assert.equal(r.json.data.user.password, undefined);

  r = await api('POST', '/auth/register', { body: { name: 'Amy', email: 'amy@example.com', password: 'abc12345' } });
  assert.equal(r.status, 409);

  r = await api('POST', '/auth/login', { body: { email: 'amy@example.com', password: 'wrong123' } });
  assert.equal(r.status, 401);

  r = await api('POST', '/auth/login', { body: { email: 'amy@example.com', password: 'abc12345' } });
  assert.equal(r.status, 200);
  userToken = r.json.data.token;

  r = await api('GET', '/auth/me', { token: userToken });
  assert.equal(r.json.data.user.email, 'amy@example.com');

  r = await api('GET', '/auth/me', { token: 'bad.token.here' });
  assert.equal(r.status, 401);

  r = await api('POST', '/auth/login', { body: { email: 'admin@test.local', password: 'Admin1234' } });
  adminToken = r.json.data.token;
});

test('密碼以雜湊儲存', async () => {
  const { User } = await import('../src/models/User.js');
  const u = await User.findOne({ email: 'amy@example.com' }).select('+password');
  assert.notEqual(u.password, 'abc12345');
  assert.match(u.password, /^\$2[aby]\$/);
});

test('商品列表：分頁 / 分類 / 關鍵字', async () => {
  let r = await api('GET', '/products?page=1&limit=5');
  assert.equal(r.status, 200);
  assert.equal(r.json.data.length, 5);
  assert.equal(r.json.pagination.total, 34);
  assert.equal(r.json.pagination.totalPages, 7);

  r = await api('GET', `/products?category=${encodeURIComponent('光耦・繼電器')}`);
  assert.equal(r.json.data.length, 3);
  assert.ok(r.json.data.every((p) => p.category === '光耦・繼電器'));

  r = await api('GET', `/products?keyword=${encodeURIComponent('analog devices')}`);
  assert.equal(r.json.pagination.total, 2); // 品牌欄位也可搜尋，且不分大小寫

  r = await api('GET', `/products?keyword=${encodeURIComponent('.*(')}`);
  assert.equal(r.status, 200);
  assert.equal(r.json.data.length, 0);

  r = await api('GET', '/products?category=不存在');
  assert.equal(r.status, 400);

  r = await api('GET', '/products?sort=price_asc&limit=50');
  const prices = r.json.data.map((p) => p.price);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));

  r = await api('GET', '/products?limit=50');
  productId = r.json.data.find((p) => p.title === 'ADuM1201BRZ 數位隔離IC').id;
  soldOutId = r.json.data.find((p) => p.stock === 0).id;
  lowStockId = r.json.data.find((p) => p.stock === 3).id;

  r = await api('GET', `/products/${productId}`);
  assert.equal(r.json.data.title, 'ADuM1201BRZ 數位隔離IC');
  r = await api('GET', '/products/123');
  assert.equal(r.status, 400);
  r = await api('GET', '/products/000000000000000000000000');
  assert.equal(r.status, 404);

  r = await api('GET', '/products/categories');
  assert.equal(r.json.data.length, 7);
});

test('管理員權限', async () => {
  const body = { title: '測試商品', category: '模組・配件', price: 100, imageUrl: 'https://example.com/a.jpg', stock: 5 };
  let r = await api('POST', '/admin/products', { body });
  assert.equal(r.status, 401);
  r = await api('POST', '/admin/products', { token: userToken, body });
  assert.equal(r.status, 403);
  r = await api('POST', '/admin/products', { token: adminToken, body: { ...body, price: -1 } });
  assert.equal(r.status, 400);
  r = await api('POST', '/admin/products', { token: adminToken, body });
  assert.equal(r.status, 201);
  const id = r.json.data.id;

  r = await api('PATCH', `/admin/products/${id}`, { token: adminToken, body: { price: 200 } });
  assert.equal(r.json.data.price, 200);

  // 加入購物車後刪除商品，購物車應同步移除
  await api('POST', '/cart/items', { token: userToken, body: { productId: id, quantity: 1 } });
  r = await api('DELETE', `/admin/products/${id}`, { token: adminToken });
  assert.equal(r.status, 200);
  r = await api('GET', '/cart', { token: userToken });
  assert.equal(r.json.data.items.length, 0);
  r = await api('DELETE', `/admin/products/${id}`, { token: adminToken });
  assert.equal(r.status, 404);
});

test('購物車：邊界情況', async () => {
  let r = await api('GET', '/cart');
  assert.equal(r.status, 401);

  r = await api('POST', '/cart/items', { token: userToken, body: { productId, quantity: 2 } });
  assert.equal(r.status, 201);
  assert.equal(r.json.data.total, 280);

  // 重複加入 → 累加
  r = await api('POST', '/cart/items', { token: userToken, body: { productId, quantity: 1 } });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.items.length, 1);
  assert.equal(r.json.data.items[0].quantity, 3);

  for (const quantity of [0, -1, 1.5, '3', 100]) {
    r = await api('POST', '/cart/items', { token: userToken, body: { productId, quantity } });
    assert.equal(r.status, 400, `quantity=${quantity}`);
  }
  r = await api('POST', '/cart/items', { token: userToken, body: { productId: 'abc' } });
  assert.equal(r.status, 400);
  r = await api('POST', '/cart/items', { token: userToken, body: { productId: '000000000000000000000000' } });
  assert.equal(r.status, 404);
  r = await api('POST', '/cart/items', { token: userToken, body: { productId: soldOutId } });
  assert.equal(r.status, 400);
  r = await api('POST', '/cart/items', { token: userToken, body: { productId: lowStockId, quantity: 4 } });
  assert.equal(r.status, 400);
  r = await api('POST', '/cart/items', { token: userToken, body: '{bad json' });
  assert.equal(r.status, 400);

  r = await api('PATCH', `/cart/items/${productId}`, { token: userToken, body: { quantity: 5 } });
  assert.equal(r.json.data.items[0].quantity, 5);
  r = await api('PATCH', `/cart/items/${productId}`, { token: userToken, body: { quantity: 0 } });
  assert.equal(r.status, 400);
  r = await api('PATCH', `/cart/items/${lowStockId}`, { token: userToken, body: { quantity: 1 } });
  assert.equal(r.status, 404);

  r = await api('DELETE', `/cart/items/${productId}`, { token: userToken });
  assert.equal(r.json.data.items.length, 0);
  r = await api('DELETE', `/cart/items/${productId}`, { token: userToken });
  assert.equal(r.status, 404);
});

test('結帳與訂單', async () => {
  const recipient = { name: '王小明', phone: '0912345678', address: '台北市中正區重慶南路一段 122 號' };
  const stockOf = async (id) => (await api('GET', `/products/${id}`)).json.data.stock;

  // 空購物車不能結帳
  let r = await api('POST', '/orders', { token: userToken, body: { recipient, paymentMethod: '貨到付款' } });
  assert.equal(r.status, 400);

  await api('POST', '/cart/items', { token: userToken, body: { productId: lowStockId, quantity: 2 } });
  await api('POST', '/cart/items', { token: userToken, body: { productId, quantity: 1 } });
  const lowBefore = await stockOf(lowStockId);

  // 欄位驗證
  for (const body of [
    { recipient: { ...recipient, phone: '123' }, paymentMethod: '貨到付款' },
    { recipient: { ...recipient, phone: '09212345678' }, paymentMethod: '貨到付款' }, // 11 碼手機不能被當成市話
    { recipient: { ...recipient, address: '台北' }, paymentMethod: '貨到付款' },
    { recipient, paymentMethod: '信用卡' },
    { recipient, paymentMethod: '貨到付款', status: '已完成' },
    { recipient, paymentMethod: '貨到付款', total: 1 },
  ]) {
    r = await api('POST', '/orders', { token: userToken, body });
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  r = await api('POST', '/orders', { body: { recipient, paymentMethod: '貨到付款' } });
  assert.equal(r.status, 401);

  // 成立訂單：金額由後端計算、扣庫存、清空購物車
  r = await api('POST', '/orders', { token: userToken, body: { recipient, paymentMethod: '貨到付款', note: '請小心包裝' } });
  assert.equal(r.status, 201);
  const big = r.json.data;
  assert.match(big.orderNo, /^EM\d{14}$/);
  assert.equal(big.status, '處理中');
  assert.equal(big.shippingFee, 0);
  assert.equal(big.total, big.items.reduce((s, i) => s + i.price * i.quantity, 0));
  assert.equal(await stockOf(lowStockId), lowBefore - 2);
  r = await api('GET', '/cart', { token: userToken });
  assert.equal(r.json.data.items.length, 0);

  // 未滿免運門檻要收運費；ATM 為待付款
  await api('POST', '/cart/items', { token: userToken, body: { productId, quantity: 1 } });
  r = await api('GET', '/cart', { token: userToken });
  assert.equal(r.json.data.shippingFee, 60);
  r = await api('POST', '/orders', { token: userToken, body: { recipient, paymentMethod: 'ATM 轉帳' } });
  const small = r.json.data;
  assert.equal(small.shippingFee, 60);
  assert.equal(small.total, 140 + 60);
  assert.equal(small.status, '待付款');

  r = await api('GET', '/orders', { token: userToken });
  assert.equal(r.json.data.length, 2);
  assert.equal(r.json.data[0].id, small.id); // 新的在前

  // 其他會員看不到、也取消不了別人的訂單
  r = await api('POST', '/auth/register', { body: { name: 'Bob', email: 'bob@example.com', password: 'bob12345' } });
  const bobToken = r.json.data.token;
  assert.equal((await api('GET', `/orders/${big.id}`, { token: bobToken })).status, 404);
  assert.equal((await api('POST', `/orders/${big.id}/cancel`, { token: bobToken })).status, 404);
  assert.equal((await api('GET', `/orders/${big.id}`, { token: userToken })).status, 200);

  // 取消：歸還庫存；不可重複取消
  const before = await stockOf(lowStockId);
  r = await api('POST', `/orders/${big.id}/cancel`, { token: userToken });
  assert.equal(r.json.data.status, '已取消');
  assert.equal(await stockOf(lowStockId), before + 2);
  r = await api('POST', `/orders/${big.id}/cancel`, { token: userToken });
  assert.equal(r.status, 400);

  // 下單前庫存被改掉：擋下且不扣任何庫存
  await api('POST', '/cart/items', { token: userToken, body: { productId: lowStockId, quantity: 2 } });
  await api('POST', '/cart/items', { token: userToken, body: { productId, quantity: 1 } });
  const okStock = await stockOf(productId);
  await api('PATCH', `/admin/products/${lowStockId}`, { token: adminToken, body: { stock: 1 } });
  r = await api('POST', '/orders', { token: userToken, body: { recipient, paymentMethod: '貨到付款' } });
  assert.equal(r.status, 400);
  assert.match(r.json.message, /庫存僅剩 1/);
  assert.equal(await stockOf(productId), okStock);

  // 管理員訂單管理
  assert.equal((await api('GET', '/admin/orders', { token: userToken })).status, 403);
  r = await api('GET', '/admin/orders', { token: adminToken });
  assert.equal(r.json.pagination.total, 2);
  r = await api('PATCH', `/admin/orders/${small.id}`, { token: adminToken, body: { status: '已出貨' } });
  assert.equal(r.json.data.status, '已出貨');
  r = await api('POST', `/orders/${small.id}/cancel`, { token: userToken });
  assert.equal(r.status, 400); // 已出貨不能由會員取消
  r = await api('PATCH', `/admin/orders/${big.id}`, { token: adminToken, body: { status: '已出貨' } });
  assert.equal(r.status, 400); // 已取消不能再改
});
