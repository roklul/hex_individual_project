import { z } from 'zod';
import { MAX_QTY_PER_ITEM } from '../models/Cart.js';

const quantity = z
  .number({ error: '數量需為數字' })
  .int('數量需為整數')
  .min(1, '數量至少為 1')
  .max(MAX_QTY_PER_ITEM, `單一商品數量最多 ${MAX_QTY_PER_ITEM}`);

export const addItemSchema = z.object({
  productId: z.string({ error: '請提供 productId' }),
  quantity: quantity.default(1),
});

export const updateItemSchema = z.object({ quantity });
