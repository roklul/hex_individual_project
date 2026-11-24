import { env } from '../config/env.js';

/** 非正式環境保留最近寄出的信，方便測試與本機開發查看 */
export const outbox = [];

/**
 * 透過 Resend API 寄信（https://resend.com/docs/api-reference/emails/send-email）。
 * 未設定 RESEND_API_KEY 時不寄出：開發環境把內容印在終端機，正式環境只記錄警告。
 */
export async function sendMail({ to, subject, html, text }) {
  if (env.nodeEnv !== 'production') {
    outbox.push({ to, subject, html, text });
    if (outbox.length > 20) outbox.shift();
  }
  if (!env.resendApiKey) {
    if (env.nodeEnv === 'production') console.warn(`[mail] 未設定 RESEND_API_KEY，信件未寄出：${subject}`);
    else if (env.nodeEnv !== 'test') console.log(`[mail] 開發模式未實際寄出\n收件者：${to}\n主旨：${subject}\n${text}`);
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.mailFrom, to, subject, html, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend 寄信失敗 ${res.status}：${await res.text()}`);
  return true;
}
