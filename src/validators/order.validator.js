import { z } from 'zod';
import { PAYMENT_METHODS, ORDER_STATUS } from '../models/Order.js';
import { isValidTwPhone } from '../utils/phone.js';

export const createOrderSchema = z
  .object({
    quoteVersion: z.string().regex(/^[a-f0-9]{64}$/, '請先讀取購物車並確認最新報價'),
    recipient: z
      .object({
        name: z.string().trim().min(1, '請輸入收件人姓名').max(50, '收件人姓名最多 50 字'),
        phone: z
          .string()
          .trim()
          .refine(isValidTwPhone, '請輸入有效的電話（手機 09 開頭 10 碼，或市話如 02-12345678）'),
        address: z.string().trim().min(5, '請輸入完整的收件地址').max(200, '地址最多 200 字'),
      })
      .strict(),
    paymentMethod: z.enum(PAYMENT_METHODS, { error: `付款方式需為：${PAYMENT_METHODS.join('、')}` }),
    note: z.string().trim().max(300, '備註最多 300 字').optional(),
  })
  .strict();

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number({ error: '頁碼需為數字' }).int('頁碼需為整數').min(1, '頁碼至少為 1').default(1),
  limit: z.coerce.number({ error: '每頁筆數需為數字' }).int('每頁筆數需為整數').min(1, '每頁至少 1 筆').max(50, '每頁最多 50 筆').default(10),
});

export const updateStatusSchema = z
  .object({ status: z.enum(ORDER_STATUS, { error: `狀態需為：${ORDER_STATUS.join('、')}` }) })
  .strict();

export const transferReportSchema = z
  .object({ last5: z.string().trim().regex(/^\d{5}$/, '請輸入 5 位數字的匯款帳號末五碼') })
  .strict();
