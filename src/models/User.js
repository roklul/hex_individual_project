import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const ROLES = Object.freeze({ USER: 'user', ADMIN: 'admin' });

// 保留已停用的共用會員識別碼，即使舊資料庫仍有此帳號也不能再登入或註冊。
export const RETIRED_MEMBER_EMAIL = 'member@example.com';

export function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.USER },
    sessionVersion: { type: Number, default: 0 },
    // 忘記密碼：只保存 token 的 SHA-256 雜湊，資料庫外洩也無法直接拿來重設
    passwordReset: {
      tokenHash: { type: String, select: false },
      expiresAt: { type: Date, select: false },
      requestedAt: { type: Date, select: false },
    },
  },
  { timestamps: true },
);

userSchema.pre('save', async function updateCredentials() {
  if (!this.isNew && (this.isModified('password') || this.isModified('role'))) {
    this.$inc('sessionVersion', 1);
    // 密碼或角色變更後，先前寄出的重設密碼連結一併作廢
    this.passwordReset = undefined;
  }
  if (this.isModified('password')) this.password = await hashPassword(this.password);
});

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.toPublic = function toPublic() {
  return { id: this._id, name: this.name, email: this.email, role: this.role, createdAt: this.createdAt };
};

export const User = mongoose.model('User', userSchema);
