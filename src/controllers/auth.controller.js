import { createHash, randomBytes } from 'node:crypto';
import { User, RETIRED_MEMBER_EMAIL, hashPassword } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { signToken } from '../utils/token.js';
import { sendMail } from '../utils/mailer.js';
import { env } from '../config/env.js';

const RESET_TTL_MINUTES = 30;
const RESET_RESEND_COOLDOWN_MS = 60_000;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const authPayload = (user) => ({ token: signToken(user), user: user.toPublic() });

export async function register(req, res) {
  const { name, email, password } = req.validated.body;
  if (email === RETIRED_MEMBER_EMAIL || await User.exists({ email })) throw new AppError(409, '此 Email 已被註冊');

  // 角色不從請求取值，一律使用 schema 預設的 'user'
  const user = await User.create({ name, email, password });
  res.status(201).json({ success: true, message: '註冊成功', data: authPayload(user) });
}

export async function login(req, res) {
  const { email, password } = req.validated.body;
  if (email === RETIRED_MEMBER_EMAIL) throw new AppError(401, 'Email 或密碼錯誤');
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError(401, 'Email 或密碼錯誤');
  }
  res.json({ success: true, message: '登入成功', data: authPayload(user) });
}

export function me(req, res) {
  res.json({ success: true, data: { user: req.user.toPublic() } });
}

/* ---------- 忘記密碼 / 重設密碼 / 修改密碼 ---------- */

function resetMail(user, link) {
  const text = [
    `${user.name} 您好：`,
    '',
    '我們收到重設 EMMA 電子零件會員密碼的申請。請在 30 分鐘內開啟下列連結設定新密碼：',
    link,
    '',
    '連結只能使用一次。如果您沒有申請重設密碼，請忽略這封信，您的密碼不會改變。',
  ].join('\n');
  const html = `<div style="font-family:'Microsoft JhengHei',sans-serif;line-height:1.7;color:#1c2634;max-width:520px">
  <h2 style="color:#1e3a5f">EMMA 電子零件｜重設密碼</h2>
  <p>${escapeHtml(user.name)} 您好：</p>
  <p>我們收到重設會員密碼的申請。請在 <strong>30 分鐘內</strong>點擊下方按鈕設定新密碼：</p>
  <p><a href="${link}" style="display:inline-block;background:#1e3a5f;color:#fff;padding:12px 28px;border-radius:999px;text-decoration:none">設定新密碼</a></p>
  <p style="font-size:13px;color:#666">按鈕無法使用時，請複製此網址到瀏覽器：<br>${link}</p>
  <p style="font-size:13px;color:#666">連結只能使用一次。如果您沒有申請重設密碼，請忽略這封信，您的密碼不會改變。</p>
</div>`;
  return { to: user.email, subject: '【EMMA 電子零件】重設密碼連結', text, html };
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function forgotPassword(req, res) {
  const { email } = req.validated.body;
  // 不論 Email 是否註冊都回同樣訊息，避免被用來查詢誰是會員
  res.json({ success: true, message: '如果這個 Email 已註冊，我們已寄出重設密碼連結，請在 30 分鐘內完成設定' });

  // 回應已送出，之後的錯誤只記錄，不能再交給錯誤處理中介層
  issueResetLink(email).catch((err) => console.error('[forgot-password]', err.message));
}

async function issueResetLink(email) {
  if (email === RETIRED_MEMBER_EMAIL) return;
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  // 同一帳號 60 秒內只寄一次，避免被拿來大量寄信
  const user = await User.findOneAndUpdate(
    {
      email,
      $or: [
        { 'passwordReset.requestedAt': { $exists: false } },
        { 'passwordReset.requestedAt': { $lte: new Date(now - RESET_RESEND_COOLDOWN_MS) } },
      ],
    },
    {
      $set: {
        'passwordReset.tokenHash': sha256(token),
        'passwordReset.expiresAt': new Date(now.getTime() + RESET_TTL_MINUTES * 60_000),
        'passwordReset.requestedAt': now,
      },
    },
    { returnDocument: 'after' },
  );
  if (!user) return;
  await sendMail(resetMail(user, `${env.appUrl}/reset-password?token=${token}`));
}

export async function resetPassword(req, res) {
  const { token, password } = req.validated.body;
  const user = await User.findOneAndUpdate(
    {
      'passwordReset.tokenHash': sha256(token),
      'passwordReset.expiresAt': { $gt: new Date() },
      email: { $ne: RETIRED_MEMBER_EMAIL },
    },
    // 設定新密碼、作廢連結，並讓所有舊的登入憑證失效
    { $set: { password: await hashPassword(password) }, $unset: { passwordReset: 1 }, $inc: { sessionVersion: 1 } },
    { returnDocument: 'after' },
  );
  if (!user) throw new AppError(400, '重設連結無效或已過期，請重新申請');
  res.json({ success: true, message: '密碼已重設，其他裝置的登入已全部登出', data: authPayload(user) });
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.validated.body;
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(currentPassword))) {
    throw new AppError(400, '目前的密碼不正確', [{ field: 'currentPassword', message: '目前的密碼不正確' }]);
  }
  const updated = await User.findOneAndUpdate(
    // 舊資料可能沒有 sessionVersion 欄位（讀取時才補預設 0），版本 0 也要能比對到缺欄位的文件
    { _id: user._id, sessionVersion: user.sessionVersion === 0 ? { $in: [0, null] } : user.sessionVersion },
    { $set: { password: await hashPassword(newPassword) }, $unset: { passwordReset: 1 }, $inc: { sessionVersion: 1 } },
    { returnDocument: 'after' },
  );
  if (!updated) throw new AppError(409, '登入狀態已變更，請重新登入後再試');
  // 回傳新的憑證讓目前裝置保持登入，其他裝置的舊憑證則全部失效
  res.json({ success: true, message: '密碼已更新，其他裝置的登入已全部登出', data: authPayload(updated) });
}
