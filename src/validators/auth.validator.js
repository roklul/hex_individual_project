import { z } from 'zod';

// 密碼規則：註冊、重設密碼、修改密碼共用
export const passwordSchema = z
  .string()
  .min(8, '密碼至少 8 碼')
  .max(72, '密碼最多 72 碼')
  .regex(/[A-Za-z]/, '密碼需包含英文字母')
  .regex(/\d/, '密碼需包含數字');

// .strict() 會拒絕未定義的欄位（例如 role、isAdmin），從入口就擋掉提權企圖
export const registerSchema = z
  .object({
    name: z.string().trim().min(1, '請輸入姓名').max(50, '姓名最多 50 字'),
    email: z.string().trim().toLowerCase().pipe(z.email('Email 格式不正確')),
    password: passwordSchema,
  })
  .strict();

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Email 格式不正確')),
  password: z.string().min(1, '請輸入密碼'),
});

export const forgotPasswordSchema = z
  .object({ email: z.string().trim().toLowerCase().pipe(z.email('Email 格式不正確')) })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, '重設連結無效或已過期，請重新申請'),
    password: passwordSchema,
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, '請輸入目前的密碼'),
    newPassword: passwordSchema,
  })
  .strict()
  .refine((o) => o.currentPassword !== o.newPassword, { path: ['newPassword'], message: '新密碼不可與目前密碼相同' });
