import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { seedCatalog } from '../scripts/data/products.js';
import { runSeed, resetCatalog } from '../scripts/seed.js';
import { Product } from '../src/models/Product.js';
import { Cart } from '../src/models/Cart.js';
import { Order } from '../src/models/Order.js';
import { cancelMyOrder } from '../src/controllers/order.controller.js';

let repl;
before(async () => {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(repl.getUri('test_catalog'));
  await Promise.all([Product.init(), Cart.init(), Order.init()]);
});
beforeEach(async () => {
  await Promise.all([Product.deleteMany({}), Cart.deleteMany({}), Order.deleteMany({})]);
});
after(async () => {
  await mongoose.disconnect();
  await repl?.stop();
});

function unkeyed({ catalogKey, ...product }) {
  return product;
}

test('舊目錄可遷移並重跑，保留自建商品、購物車、庫存和既有訂單回補目標', async () => {
  const oldProducts = await Product.insertMany(seedCatalog.map(({ product, imageFile, legacyImageUrl }, index) => ({
    ...unkeyed(product),
    imageUrl: index % 2 ? legacyImageUrl : `https://previous.example/gallery/${imageFile}`,
    stock: 0, price: 5, isEnabled: false,
  })));
  const old = oldProducts[0];
  const custom = await Product.create({
    ...unkeyed(seedCatalog[0].product), content: '自建商品內容', description: '自建商品', imageUrl: 'https://shop.example/custom.webp',
  });
  const user = new mongoose.Types.ObjectId();
  const cart = await Cart.create({ user, items: [{ product: old._id, quantity: 1 }] });
  const order = await Order.create({
    user, orderNo: 'OLD-001', recipient: { name: 'Test', phone: '0900000000', address: '測試地址' },
    paymentMethod: '貨到付款', subtotal: 10, shippingFee: 0, total: 10,
    items: [{ product: old._id, title: old.title, price: 5, quantity: 2, subtotal: 10 }],
  });
  await runSeed();
  await runSeed();

  assert.equal(await Product.countDocuments(), 35);
  const adopted = await Product.find({ catalogKey: { $exists: true } }).select('+catalogKey').sort({ catalogKey: 1 }).lean();
  assert.deepEqual(adopted.map((p) => String(p._id)), oldProducts.map((p) => String(p._id)));
  assert.ok(adopted.every((p) => p.stock === 0 && p.price === 5 && !p.isEnabled));
  assert.equal((await Product.findById(custom._id).select('+catalogKey')).catalogKey, undefined);
  const preserved = await Cart.findById(cart._id);
  assert.equal(preserved.__v, cart.__v);
  assert.ok(preserved.items[0].product.equals(old._id));
  await assert.rejects(resetCatalog(Product.db.name), /已有訂單/);
  await cancelMyOrder({ user: { _id: user }, params: { id: order.id } }, { json() {} });
  assert.equal((await Product.findById(old._id)).stock, 2);
});

test('無法唯一辨認舊商品時整次回滾，解決歧義後可重跑', async () => {
  const duplicate = unkeyed(seedCatalog[1].product);
  const two = await Product.insertMany([duplicate, duplicate]);
  await assert.rejects(runSeed(), /無法唯一識別/);
  assert.equal(await Product.countDocuments(), 2);
  assert.equal(await Product.countDocuments({ catalogKey: { $exists: true } }), 0);
  await Product.deleteOne({ _id: two[1]._id });
  await runSeed();
  assert.equal(await Product.countDocuments(), 34);
  assert.equal((await Product.findById(two[0]._id).select('+catalogKey')).catalogKey, seedCatalog[1].product.catalogKey);
});

test('並行匯入各永久編號只建立一次，明確確認重置才清除測試商品與有內容的購物車', async () => {
  await Promise.all([runSeed(), runSeed()]);
  assert.equal(await Product.countDocuments(), 34);
  const custom = await Product.create({ ...unkeyed(seedCatalog[0].product), title: '自建商品' });
  const full = await Cart.create({ user: new mongoose.Types.ObjectId(), items: [{ product: custom._id, quantity: 1 }] });
  const empty = await Cart.create({ user: new mongoose.Types.ObjectId() });
  await assert.rejects(resetCatalog('wrong'), /確認目標/);
  assert.equal(await Product.countDocuments(), 35);
  await resetCatalog(Product.db.name);
  assert.equal(await Product.countDocuments(), 34);
  assert.equal(await Product.exists({ _id: custom._id }), null);
  const cleared = await Cart.findById(full._id);
  assert.equal(cleared.items.length, 0);
  assert.equal(cleared.__v, full.__v + 1);
  assert.equal((await Cart.findById(empty._id)).__v, empty.__v);
});
