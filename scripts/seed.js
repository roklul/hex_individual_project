import 'dotenv/config';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { Product } from '../src/models/Product.js';
import { Cart } from '../src/models/Cart.js';
import { Order } from '../src/models/Order.js';
import { escapeRegex } from '../src/utils/escapeRegex.js';
import { seedCatalog } from './data/products.js';

async function importCatalog(session) {
  for (const { product, imageFile, legacyImageUrl } of seedCatalog) {
    const { catalogKey, title, description, content } = product;
    if (await Product.exists({ catalogKey }).session(session)) continue;

    // 舊版可自訂圖片網域，也曾使用露天圖床。交叉比對原圖與舊文案，避免只因同名就接管自建商品。
    const oldImages = [legacyImageUrl, new RegExp('/' + escapeRegex(imageFile) + '$')];
    const candidates = await Product.find({
      catalogKey: { $exists: false },
      $or: [{ imageUrl: { $in: oldImages } }, { content }],
    }).select('title description content imageUrl').session(session).lean();
    if (candidates.length > 0) {
      const [old] = candidates;
      if (candidates.length !== 1 || (old.title !== title && old.description !== description && old.content !== content)) {
        throw new Error(`種子商品 ${catalogKey} 的舊資料無法唯一識別，請核對對應商品後再匯入`);
      }
      await Product.updateOne({ _id: old._id }, { $set: { catalogKey } }, { session });
    } else {
      await Product.create([product], { session });
    }
  }
}

export async function runSeed() {
  await Product.init();
  try {
    await Product.db.transaction(importCatalog);
  } catch (error) {
    // 同時首次匯入時，另一個交易可能已插入同一永久編號。以新快照重新核對一次。
    if (error.code !== 11000 || !error.keyPattern?.catalogKey) throw error;
    await Product.db.transaction(importCatalog);
  }
  console.log(`[seed] 已核對 ${seedCatalog.length} 筆目錄商品`);
}

export async function resetCatalog(confirmedDatabase) {
  if (!confirmedDatabase || confirmedDatabase !== Product.db.name) {
    throw new Error('重置商品與購物車必須以 --confirm-db=資料庫名稱 確認目標');
  }
  await Promise.all([Product.init(), Cart.init(), Order.init()]);
  await Product.db.transaction(async (session) => {
    if (await Order.exists({}).session(session)) throw new Error('資料庫已有訂單，無法重置商品');
    await Product.deleteMany({}, { session });
    await Cart.updateMany({ 'items.0': { $exists: true } }, { $set: { items: [] }, $inc: { __v: 1 } }, { session });
    await Product.insertMany(seedCatalog.map(({ product }) => product), { session });
  });
  console.log(`[seed] 已重置 ${confirmedDatabase} 的商品與購物車`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.MONGODB_URI) throw new Error('缺少 MONGODB_URI');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    if (process.argv.includes('--reset')) {
      const confirmation = process.argv.slice(2).find((arg) => arg.startsWith('--confirm-db='));
      await resetCatalog(confirmation?.slice('--confirm-db='.length));
    } else {
      await runSeed();
    }
  } finally {
    await mongoose.disconnect();
  }
}
