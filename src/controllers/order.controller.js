import crypto from 'node:crypto';
import { Order, CANCELLABLE_STATUS } from '../models/Order.js';
import { Cart } from '../models/Cart.js';
import { Product } from '../models/Product.js';
import { calcShipping } from '../config/shipping.js';
import { AppError } from '../utils/AppError.js';

function makeOrderNo() {
  const d = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10).replace(/-/g, ''); // 台灣日期
  return `EM${d}${crypto.randomInt(100000, 999999)}`;
}

const toDTO = (o) => {
  const { _id, __v, ...rest } = o.toObject ? o.toObject() : o;
  return { id: _id, ...rest };
};

/** 歸還庫存（取消訂單、或下單過程中途失敗時回滾） */
async function restoreStock(items) {
  await Promise.all(items.map((i) => Product.updateOne({ _id: i.product }, { $inc: { stock: i.quantity } })));
}

export async function createOrder(req, res) {
  const { recipient, paymentMethod, note = '' } = req.validated.body;
  const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
  const lines = (cart?.items || []).filter((i) => i.product);
  if (lines.length === 0) throw new AppError(400, '購物車是空的，無法結帳');

  // 先完整檢查一次，一次回報所有問題
  const problems = lines
    .map(({ product: p, quantity }) => {
      if (!p.isEnabled) return `「${p.title}」已下架`;
      if (p.stock < quantity) return p.stock === 0 ? `「${p.title}」已售完` : `「${p.title}」庫存僅剩 ${p.stock} ${p.unit}`;
      return null;
    })
    .filter(Boolean);
  if (problems.length) throw new AppError(400, `請先調整購物車：${problems.join('；')}`, problems.map((message) => ({ message })));

  // 逐項以「庫存足夠」為條件原子扣庫存，避免兩人同時搶最後一件時超賣
  const reserved = [];
  for (const { product: p, quantity } of lines) {
    const r = await Product.updateOne({ _id: p._id, isEnabled: true, stock: { $gte: quantity } }, { $inc: { stock: -quantity } });
    if (r.modifiedCount !== 1) {
      await restoreStock(reserved);
      throw new AppError(409, `「${p.title}」庫存剛被買走，請重新確認購物車`);
    }
    reserved.push({ product: p._id, quantity });
  }

  try {
    const items = lines.map(({ product: p, quantity }) => ({
      product: p._id,
      title: p.title,
      brand: p.brand,
      imageUrl: p.imageUrl,
      unit: p.unit,
      price: p.price,
      quantity,
      subtotal: p.price * quantity,
    }));
    const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
    const shippingFee = calcShipping(subtotal);

    const order = await Order.create({
      orderNo: makeOrderNo(),
      user: req.user._id,
      items,
      recipient,
      paymentMethod,
      note,
      subtotal,
      shippingFee,
      total: subtotal + shippingFee,
      status: paymentMethod === 'ATM 轉帳' ? '待付款' : '處理中',
    });

    cart.items = [];
    await cart.save();
    res.status(201).json({ success: true, message: '訂單已成立', data: toDTO(order) });
  } catch (err) {
    await restoreStock(reserved);
    throw err;
  }
}

export async function listMyOrders(req, res) {
  const { page, limit } = req.validated.query;
  const filter = { user: req.user._id };
  const [total, orders] = await Promise.all([
    Order.countDocuments(filter),
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
  ]);
  res.json({
    success: true,
    data: orders.map(toDTO),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}

async function findMyOrder(req) {
  // 只能查自己的訂單；查別人的訂單一律回 404，不透露訂單是否存在
  const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
  if (!order) throw new AppError(404, '找不到此訂單');
  return order;
}

export async function getMyOrder(req, res) {
  res.json({ success: true, data: toDTO(await findMyOrder(req)) });
}

export async function cancelMyOrder(req, res) {
  const order = await findMyOrder(req);
  if (!CANCELLABLE_STATUS.includes(order.status)) {
    throw new AppError(400, `訂單狀態為「${order.status}」，無法取消`);
  }
  // 以目前狀態為條件更新，避免重複取消造成庫存重複歸還
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: { $in: CANCELLABLE_STATUS } },
    { status: '已取消', cancelledAt: new Date() },
    { new: true },
  );
  if (!updated) throw new AppError(409, '訂單狀態已變更，請重新整理');
  await restoreStock(updated.items);
  res.json({ success: true, message: '訂單已取消', data: toDTO(updated) });
}

/* ---------- 管理員 ---------- */

export async function adminListOrders(req, res) {
  const { page, limit } = req.validated.query;
  const [total, orders] = await Promise.all([
    Order.countDocuments(),
    Order.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('user', 'name email').lean(),
  ]);
  res.json({
    success: true,
    data: orders.map(toDTO),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}

export async function adminUpdateOrderStatus(req, res) {
  const { status } = req.validated.body;
  const order = await Order.findById(req.params.id);
  if (!order) throw new AppError(404, '找不到此訂單');
  if (order.status === '已取消') throw new AppError(400, '已取消的訂單無法變更狀態');

  if (status === '已取消') {
    order.cancelledAt = new Date();
    await restoreStock(order.items);
  }
  order.status = status;
  await order.save();
  res.json({ success: true, message: `訂單狀態已更新為「${status}」`, data: toDTO(order) });
}
