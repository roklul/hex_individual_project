// 管理員帳號只能透過這支「伺服器端腳本」建立，API 沒有任何可修改角色的端點。
// 用法：在 .env 設定 ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME 後執行 npm run create-admin
import 'dotenv/config';
import mongoose from 'mongoose';
import { User, ROLES } from '../src/models/User.js';

export async function upsertAdmin({ email, password, name = 'Admin' }) {
  if (!email || !password) throw new Error('請設定 ADMIN_EMAIL 與 ADMIN_PASSWORD');
  if (password.length < 8) throw new Error('ADMIN_PASSWORD 至少 8 碼');

  let user = await User.findOne({ email: email.toLowerCase() });
  if (user) {
    user.role = ROLES.ADMIN;
    user.password = password; // pre-save hook 會重新雜湊
    user.name = name;
  } else {
    user = new User({ email, password, name, role: ROLES.ADMIN });
  }
  await user.save();
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
