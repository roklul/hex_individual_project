import { z } from 'zod';
import { CATEGORIES } from '../models/Product.js';

export const listQuerySchema = z.object({
  page: z.coerce.number({ error: '頁碼需為數字' }).int('頁碼需為整數').min(1, '頁碼至少為 1').default(1),
  limit: z.coerce.number({ error: '每頁筆數需為數字' }).int('每頁筆數需為整數').min(1, '每頁至少 1 筆').max(50, '每頁最多 50 筆').default(12),
  // 空字串視為未篩選
  category: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(CATEGORIES, { error: `分類需為：${CATEGORIES.join('、')}` }).optional(),
  ),
  keyword: z.string().trim().max(50, '關鍵字最多 50 字').optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc'], { error: '排序需為 newest、price_asc 或 price_desc' }).default('newest'),
});

// 圖片只接受 http(s)，避免 javascript:、data: 等網址
const imageUrl = (message) => z.url({ protocol: /^https?$/, error: message });

const base = {
  title: z.string().trim().min(1, '請輸入商品名稱').max(100, '商品名稱最多 100 字'),
  brand: z.string().trim().max(50, '品牌最多 50 字').optional(),
  description: z.string().max(2000, '商品簡述最多 2000 字').optional(),
  content: z.string().max(5000, '商品說明最多 5000 字').optional(),
  category: z.enum(CATEGORIES, { error: `分類需為：${CATEGORIES.join('、')}` }),
  price: z.number({ error: '價格需為數字' }).int('價格需為整數').min(0, '價格不可為負數'),
  originPrice: z.number({ error: '原價需為數字' }).int('原價需為整數').min(0, '原價不可為負數').optional(),
  unit: z.string().max(10, '單位最多 10 字').optional(),
  imageUrl: imageUrl('圖片網址需為 http 或 https 開頭的有效網址'),
  imagesUrl: z.array(imageUrl('附圖網址需為 http 或 https 開頭的有效網址')).max(10, '附圖最多 10 張').optional(),
  stock: z.number({ error: '庫存需為數字' }).int('庫存需為整數').min(0, '庫存不可為負數'),
  isEnabled: z.boolean({ error: '上架狀態需為 true 或 false' }).optional(),
};

export const createProductSchema = z.object(base).strict();
export const updateProductSchema = z
  .object(base)
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, '至少需提供一個要更新的欄位');
