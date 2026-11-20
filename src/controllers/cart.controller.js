import mongoose from 'mongoose';
import { Cart, MAX_QTY_PER_ITEM } from '../models/Cart.js';
import { Product } from '../models/Product.js';
import { AppError } from '../utils/AppError.js';

const PRODUCT_FIELDS = 'title price originPrice unit imageUrl stock category isEnabled';

async function getCart(userId) {
  return Cart.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId, items: [] } },
    { upsert: true, new: true },
  );
}

/** 組裝回傳格式，並順手清掉已被刪除的商品 */
async function buildCartResponse(cart) {
  await cart.populate('items.product', PRODUCT_FIELDS);
  const before = cart.items.length;
  cart.items = cart.items.filter((i) => i.product);
  if (cart.items.length !== before) await cart.save();

  const items = cart.items.map((i) => {
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
  return {
    items,
    totalQuantity: items.reduce((s, i) => s + i.quantity, 0),
    total: payable.reduce((s, i) => s + i.subtotal, 0),
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

export async function addItem(req, res) {
  const { productId, quantity } = req.validated.body;
  const product = await findSellableProduct(productId);
  if (product.stock <= 0) throw new AppError(400, `「${product.title}」已售完`);

  const cart = await getCart(req.user._id);
  const existing = cart.items.find((i) => i.product.equals(product._id));
  const nextQty = (existing?.quantity || 0) + quantity;
  const max = Math.min(product.stock, MAX_QTY_PER_ITEM);

  if (nextQty > max) {
    const remain = max - (existing?.quantity || 0);
    throw new AppError(
      400,
      remain > 0
        ? `「${product.title}」最多還能加入 ${remain} ${product.unit}`
        : `「${product.title}」已達購買上限（${max} ${product.unit}）`,
    );
  }

  if (existing) existing.quantity = nextQty;
  else cart.items.push({ product: product._id, quantity });
  await cart.save();

  res.status(existing ? 200 : 201).json({
    success: true,
    message: existing ? `已更新「${product.title}」數量為 ${nextQty}` : `已將「${product.title}」加入購物車`,
    data: await buildCartResponse(cart),
  });
}

export async function updateItem(req, res) {
  const { quantity } = req.validated.body;
  const cart = await getCart(req.user._id);
  const item = cart.items.find((i) => i.product.equals(req.params.productId));
  if (!item) throw new AppError(404, '購物車中沒有此商品');

  const product = await findSellableProduct(req.params.productId);
  const max = Math.min(product.stock, MAX_QTY_PER_ITEM);
  if (quantity > max) throw new AppError(400, `「${product.title}」庫存不足，最多可購買 ${max} ${product.unit}`);

  item.quantity = quantity;
  await cart.save();
  res.json({ success: true, message: '已更新數量', data: await buildCartResponse(cart) });
}

export async function removeItem(req, res) {
  const cart = await getCart(req.user._id);
  const before = cart.items.length;
  cart.items = cart.items.filter((i) => !i.product.equals(req.params.productId));
  if (cart.items.length === before) throw new AppError(404, '購物車中沒有此商品');
  await cart.save();
  res.json({ success: true, message: '已移除商品', data: await buildCartResponse(cart) });
}

export async function clearCart(req, res) {
  const cart = await getCart(req.user._id);
  cart.items = [];
  await cart.save();
  res.json({ success: true, message: '已清空購物車', data: await buildCartResponse(cart) });
}
