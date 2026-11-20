import { z } from 'zod';
import { CATEGORIES } from '../models/Product.js';

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  category: z.enum(CATEGORIES).optional().or(z.literal('').transform(() => undefined)),
  keyword: z.string().trim().max(50).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
});

const base = {
  title: z.string().trim().min(1, '請輸入商品名稱').max(100),
  brand: z.string().trim().max(50).optional(),
  description: z.string().max(2000).optional(),
  content: z.string().max(5000).optional(),
  category: z.enum(CATEGORIES, { error: `分類需為：${CATEGORIES.join('、')}` }),
  price: z.number({ error: '價格需為數字' }).int().min(0),
  originPrice: z.number().int().min(0).optional(),
  unit: z.string().max(10).optional(),
  imageUrl: z.url('圖片網址格式不正確'),
  imagesUrl: z.array(z.url()).max(10).optional(),
  stock: z.number().int().min(0),
  isEnabled: z.boolean().optional(),
};

export const createProductSchema = z.object(base).strict();
export const updateProductSchema = z
  .object(base)
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, '至少需提供一個要更新的欄位');
