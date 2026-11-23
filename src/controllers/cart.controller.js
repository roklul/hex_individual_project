import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { Cart, MAX_QTY_PER_ITEM } from '../models/Cart.js';
import { Product } from '../models/Product.js';
import { AppError } from '../utils/AppError.js';
import { calcShipping, FREE_SHIPPING_THRESHOLD } from '../config/shipping.js';

const PRODUCT_FIELDS = 'title price originPrice unit imageUrl stock category isEnabled';

async function getCart(userId) {
  const filter = { user: userId };
  let cart;
  try {
    cart = await Cart.findOneAndUpdate(
      filter,
      { $setOnInsert: { user: userId, items: [] } },
      { upsert: true, returnDocument: 'after', timestamps: false },
    );
  } catch (err) {
    if (err.code !== 11000) throw err;
    cart = await Cart.findOne(filter);
  }
  if (cart.__v === undefined) {
    await Cart.updateOne({ ...filter, __v: { $exists: false } }, { $set: { __v: 0 } }, { timestamps: false });
    return Cart.findOne(filter);
  }
  return cart;
}

async function buildCartResponse(cart) {
  await cart.populate('items.product', PRODUCT_FIELDS);
  return cartQuote(cart);
}

export function cartQuote(cart) {
  const cartVersion = cart?.__v ?? 0;

  const items = (cart?.items || []).filter((i) => i.product).map((i) => {
    const p = i.product;
    const available = p.isEnabled && p.stock > 0;
    return {
      productId: p._id,
      product: {
        id: p._id, title: p.title, price: p.price, originPrice: p.originPrice,
        unit: p.unit, imageUrl: p.imageUrl, stock: p.stock, category: p.category,
      },
      quantity: i.quantity,
      subtotal: p.price * i.quantity,
      available,
      maxQuantity: Math.min(p.stock, MAX_QTY_PER_ITEM),
    };
  });
  const payable = items.filter((i) => i.available);
  const total = payable.reduce((s, i) => s + i.subtotal, 0);
  const shippingFee = calcShipping(total);
  const quoteItems = items.map(({ productId, product, quantity, available, maxQuantity }) => [
    productId, product.title, product.imageUrl, product.price, product.unit, quantity, available, maxQuantity >= quantity,
  ]);
  const quoteVersion = createHash('sha256').update(JSON.stringify([cartVersion, quoteItems, total, shippingFee])).digest('hex');
  return {
    items,
    cartVersion,
    quoteVersion,
    totalQuantity: items.reduce((s, i) => s + i.quantity, 0),
    total,
    shippingFee,
    grandTotal: total + shippingFee,
    freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
  };
}

async function findSellableProduct(productId) {
  if (!mongoose.isValidObjectId(productId)) throw new AppError(400, '無效的商品 ID');
  const product = await Product.findById(productId);
  if (!product || !product.isEnabled) throw new AppError(404, '商品不存在或已下架');
  return product;
}

export async function getMyCart(req, res) {
  const cart = await getCart(req.user._id);
  res.json({ success: true, data: await buildCartResponse(cart) });
}

const MAX_CART_RETRIES = 5;

/**
 * 以樂觀鎖修改購物車：每次都讀取最新購物車、重新檢查並計算，
 * 若寫入時版本已被其他請求（例如另一個分頁）改過，就重讀重算再試，
 * 確保並行加購會正確合併數量，且庫存與數量上限在同一次寫入內被檢查。
 */
async function mutateCart(userId, mutate) {
  for (let attempt = 0; attempt < MAX_CART_RETRIES; attempt++) {
    const cart = await getCart(userId);
    const result = await mutate(cart);
    try {
      await cart.save();
      return { cart, result };
    } catch (err) {
      if (err.name !== 'VersionError') throw err;
    }
  }
  throw new AppError(409, '購物車正在其他視窗更新，請稍後再試');
}

export async function addItem(req, res) {
  const { productId, quantity } = req.validated.body;
  const product = await findSellableProduct(productId);
  if (product.stock <= 0) throw new AppError(400, `「${product.title}」已售完`);
  const max = Math.min(product.stock, MAX_QTY_PER_ITEM);

  const { cart, result } = await mutateCart(req.user._id, (cart) => {
    const existing = cart.items.find((i) => i.product.equals(product._id));
    const currentQty = existing?.quantity || 0;
    const nextQty = currentQty + quantity;
    if (nextQty > max) {
      const remain = max - currentQty;
      throw new AppError(
        400,
        remain > 0
          ? `「${product.title}」最多還能加入 ${remain} ${product.unit}`
          : `「${product.title}」已達購買上限（${max} ${product.unit}）`,
      );
    }
    if (existing) existing.quantity = nextQty;
    else cart.items.push({ product: product._id, quantity });
    return { existed: !!existing, nextQty };
  });

  res.status(result.existed ? 200 : 201).json({
    success: true,
    message: result.existed ? `已更新「${product.title}」數量為 ${result.nextQty}` : `已將「${product.title}」加入購物車`,
    data: await buildCartResponse(cart),
  });
}

export async function updateItem(req, res) {
  const { quantity } = req.validated.body;
  const product = await findSellableProduct(req.params.productId);
  const max = Math.min(product.stock, MAX_QTY_PER_ITEM);
  if (quantity > max) throw new AppError(400, `「${product.title}」庫存不足，最多可購買 ${max} ${product.unit}`);

  const { cart } = await mutateCart(req.user._id, (cart) => {
    const item = cart.items.find((i) => i.product.equals(product._id));
    if (!item) throw new AppError(404, '購物車中沒有此商品');
    item.quantity = quantity;
  });
  res.json({ success: true, message: '已更新數量', data: await buildCartResponse(cart) });
}

export async function removeItem(req, res) {
  const { cart } = await mutateCart(req.user._id, (cart) => {
    const before = cart.items.length;
    cart.items = cart.items.filter((i) => !i.product.equals(req.params.productId));
    if (cart.items.length === before) throw new AppError(404, '購物車中沒有此商品');
  });
  res.json({ success: true, message: '已移除商品', data: await buildCartResponse(cart) });
}

export async function clearCart(req, res) {
  const { cart } = await mutateCart(req.user._id, (cart) => {
    cart.items = [];
  });
  res.json({ success: true, message: '已清空購物車', data: await buildCartResponse(cart) });
}
