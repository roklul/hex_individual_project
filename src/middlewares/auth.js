import { User, ROLES } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { verifyToken } from '../utils/token.js';

/** 驗證 Bearer token，並由資料庫取出最新的使用者（含角色） */
export async function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw new AppError(401, '請先登入');

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    throw new AppError(401, err.name === 'TokenExpiredError' ? '登入已過期，請重新登入' : '無效的登入憑證');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw new AppError(401, '使用者不存在，請重新登入');
  req.user = user;
  next();
}

export function requireAdmin(req, _res, next) {
  if (req.user?.role !== ROLES.ADMIN) throw new AppError(403, '需要管理員權限');
  next();
}
