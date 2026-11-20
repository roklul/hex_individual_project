// 用法：npm run seed   （會清空並重建「商品」資料，不影響會員與購物車中仍存在的商品以外的資料）
import 'dotenv/config';
import mongoose from 'mongoose';
import { Product } from '../src/models/Product.js';
import { Cart } from '../src/models/Cart.js';
import { seedProducts } from './data/products.js';

export async function runSeed() {
  await Product.deleteMany({});
  await Cart.updateMany({}, { $set: { items: [] } });
  const docs = await Product.insertMany(seedProducts);
  console.log(`[seed] 已建立 ${docs.length} 筆商品`);
}

if (process.argv[1]?.endsWith('seed.js')) {
  if (!process.env.MONGODB_URI) throw new Error('缺少 MONGODB_URI');
  await mongoose.connect(process.env.MONGODB_URI);
  await runSeed();
  await mongoose.disconnect();
}
