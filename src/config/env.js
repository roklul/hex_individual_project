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

const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

export const env = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigins,
  // 重設密碼信裡的前端網址；未設定時取 CORS_ORIGIN 中第一個 https 網址
  appUrl: (process.env.APP_URL || corsOrigins.find((o) => o.startsWith('https://')) || corsOrigins[0] || 'http://localhost:5173').replace(/\/$/, ''),
  // Resend 寄信服務；未設定時不寄信（開發環境改印在終端機）
  resendApiKey: process.env.RESEND_API_KEY || '',
  mailFrom: process.env.MAIL_FROM || 'EMMA 電子零件 <onboarding@resend.dev>',
};
