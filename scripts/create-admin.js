// 管理員帳號只能透過這支「伺服器端腳本」建立，API 沒有任何可修改角色的端點。
// 用法：在 .env 設定 ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME 後執行 npm run create-admin
import 'dotenv/config';
import mongoose from 'mongoose';
import { User, ROLES, RETIRED_MEMBER_EMAIL, hashPassword } from '../src/models/User.js';

export async function upsertAdmin({ email, password, name = 'Admin' }) {
  if (!email?.trim() || !password) throw new Error('請設定 ADMIN_EMAIL 與 ADMIN_PASSWORD');
  if (password.length < 8) throw new Error('ADMIN_PASSWORD 至少 8 碼');

  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail === RETIRED_MEMBER_EMAIL) throw new Error('此共用會員帳號已停用');

  const user = await User.findOneAndUpdate(
    { email: normalizedEmail },
    // 同時作廢舊的登入憑證與尚未使用的重設密碼連結，避免升權前寄出的連結改寫管理員密碼
    { $set: { role: ROLES.ADMIN, password: await hashPassword(password), name }, $unset: { passwordReset: 1 }, $inc: { sessionVersion: 1 } },
    { upsert: true, returnDocument: 'after', runValidators: true },
  );
  console.log(`[admin] 管理員已就緒：${user.email}`);
  return user;
}

if (process.argv[1]?.endsWith('create-admin.js')) {
  if (!process.env.MONGODB_URI) throw new Error('缺少 MONGODB_URI');
  await mongoose.connect(process.env.MONGODB_URI);
  await upsertAdmin({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    name: process.env.ADMIN_NAME,
  });
  await mongoose.disconnect();
}
