// 本機快速體驗：不需安裝 MongoDB，啟動記憶體資料庫 + 種子資料 + 開發用管理員
// 用法：npm run dev:memory   （資料在程式結束後即消失）
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri('selectshop');
process.env.JWT_SECRET ||= 'dev-only-secret-not-for-production-use-0123456789';
process.env.CORS_ORIGIN ||= 'http://localhost:5173';

const { connectDB } = await import('../src/config/db.js');
const { createApp } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');
const { runSeed } = await import('./seed.js');
const { upsertAdmin } = await import('./create-admin.js');

await connectDB(env.mongodbUri);
await runSeed();
await upsertAdmin({ email: 'admin@dev.local', password: 'Admin1234', name: 'Dev Admin' });
console.log('[dev] 開發用管理員：admin@dev.local / Admin1234（僅存在於記憶體資料庫）');

createApp().listen(env.port, () => console.log(`[server] http://localhost:${env.port}`));

const stop = async () => { await mongod.stop(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
