import { z } from 'zod';
import { PAYMENT_METHODS, ORDER_STATUS } from '../models/Order.js';
import { isValidTwPhone } from '../utils/phone.js';

export const createOrderSchema = z
  .object({
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
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const updateStatusSchema = z.object({ status: z.enum(ORDER_STATUS) }).strict();
