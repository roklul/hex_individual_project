import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function signToken(user) {
  // 只放 id，角色一律在每次請求時由資料庫查詢，避免 token 內角色被信任
  return jwt.sign({ sub: user._id.toString() }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
    algorithm: 'HS256',
  });
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
}
