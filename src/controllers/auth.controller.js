import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { signToken } from '../utils/token.js';

export async function register(req, res) {
  const { name, email, password } = req.validated.body;
  if (await User.exists({ email })) throw new AppError(409, '此 Email 已被註冊');

  // 角色不從請求取值，一律使用 schema 預設的 'user'
  const user = await User.create({ name, email, password });
  res.status(201).json({ success: true, message: '註冊成功', data: { token: signToken(user), user: user.toPublic() } });
}

export async function login(req, res) {
  const { email, password } = req.validated.body;
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError(401, 'Email 或密碼錯誤');
  }
  res.json({ success: true, message: '登入成功', data: { token: signToken(user), user: user.toPublic() } });
}

export function me(req, res) {
  res.json({ success: true, data: { user: req.user.toPublic() } });
}
