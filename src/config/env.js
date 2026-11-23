import 'dotenv/config';

const required = ['MONGODB_URI', 'JWT_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[config] 缺少必要環境變數：${key}`);
    process.exit(1);
  }
}

const exampleSecrets = ['change-me-to-a-long-random-string', 'dev-only-secret-not-for-production-use-0123456789'];
if (process.env.NODE_ENV === 'production' &&
    (process.env.JWT_SECRET.trim().length < 32 || exampleSecrets.includes(process.env.JWT_SECRET.trim()))) {
  console.error('[config] 正式環境的 JWT_SECRET 必須使用自行產生、至少 32 字元的隨機密鑰');
  process.exit(1);
}

export const env = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigins: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
};
