import crypto from 'node:crypto';
import { Order, CANCELLABLE_STATUS, statusesLeadingTo } from '../models/Order.js';
import { Cart } from '../models/Cart.js';
import { Product } from '../models/Product.js';
import { calcShipping } from '../config/shipping.js';
import { ATM_ACCOUNT, PAYMENT_DEADLINE_DAYS } from '../config/payment.js';
import { AppError } from '../utils/AppError.js';
import { cartQuote } from './cart.controller.js';

function makeOrderNo() {
  const d = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10).replace(/-/g, ''); // 台灣日期
  return `EM${d}${crypto.randomInt(100000, 999999)}`;
}

const toDTO = (o) => {
  const { _id, __v, ...rest } = o.toObject ? o.toObject() : o;
  const dto = { id: _id, ...rest };
  if (dto.paymentMethod === 'ATM 轉帳') {
    dto.atmAccount = ATM_ACCOUNT;
    dto.paymentDeadline = new Date(new Date(dto.createdAt).getTime() + PAYMENT_DEADLINE_DAYS * 86_400_000);
  }
  return dto;
};

export async function createOrder(req, res) {
  const { recipient, paymentMethod, quoteVersion, note = '' } = req.validated.body;
  const order = await Order.db.transaction(async (session) => {
    const cart = await Cart.findOne({ user: req.user._id }).session(session).populate({
      path: 'items.product', options: { session },
    });
    if (cartQuote(cart).quoteVersion !== quoteVersion) {
      const message = '購物車內容、價格或可購買數量已變更，請重新確認後再下單';
      throw new AppError(409, message, [{ field: 'quoteVersion', message }]);
    }
    const lines = (cart?.items || []).filter((i) => i.product);
    if (lines.length === 0) throw new AppError(400, '購物車是空的，無法結帳');

    const problems = lines
      .map(({ product: p, quantity }) => {
        if (!p.isEnabled) return `「${p.title}」已下架`;
        if (p.stock < quantity) return p.stock === 0 ? `「${p.title}」已售完` : `「${p.title}」庫存僅剩 ${p.stock} ${p.unit}`;
        return null;
      })
      .filter(Boolean);
    if (problems.length) throw new AppError(400, `請先調整購物車：${problems.join('；')}`, problems.map((message) => ({ message })));

    await Cart.updateOne({ _id: cart._id }, { $set: { items: [] }, $inc: { __v: 1 } }, { session });
    for (const { product: p, quantity } of lines) {
      const result = await Product.updateOne(
        { _id: p._id, isEnabled: true, stock: { $gte: quantity } },
        { $inc: { stock: -quantity } },
        { session },
      );
      if (result.modifiedCount !== 1) throw new AppError(409, `「${p.title}」庫存剛被買走，請重新確認購物車`);
    }

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

    return new Order({
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
    }).save({ session });
  });
  res.status(201).json({ success: true, message: '訂單已成立', data: toDTO(order) });
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
  const updated = await changeOrderStatus({ _id: req.params.id, user: req.user._id }, '已取消', CANCELLABLE_STATUS);
  res.json({ success: true, message: '訂單已取消', data: toDTO(updated) });
}

export async function reportTransfer(req, res) {
  const { last5 } = req.validated.body;
  const filter = { _id: req.params.id, user: req.user._id };
  // 只有自己的 ATM 訂單、且仍在待付款時可以回報；確認入帳前可重新回報修正
  const order = await Order.findOneAndUpdate(
    { ...filter, paymentMethod: 'ATM 轉帳', status: '待付款' },
    { $set: { transferReport: { last5, reportedAt: new Date() } } },
    { returnDocument: 'after', runValidators: true },
  );
  if (!order) {
    const current = await Order.findOne(filter).select('status paymentMethod');
    if (!current) throw new AppError(404, '找不到此訂單');
    if (current.paymentMethod !== 'ATM 轉帳') throw new AppError(400, '此訂單不是 ATM 轉帳，不需要回報匯款');
    throw new AppError(400, `訂單狀態為「${current.status}」，不需要回報匯款`);
  }
  res.json({ success: true, message: '已收到匯款回報，確認入帳後會盡快出貨', data: toDTO(order) });
}

async function changeOrderStatus(filter, status, allowedStatuses = statusesLeadingTo(status)) {
  return Order.db.transaction(async (session) => {
    const cancelling = status === '已取消';
    const updated = await Order.findOneAndUpdate(
      { ...filter, status: { $in: allowedStatuses } },
      { $set: cancelling ? { status, cancelledAt: new Date() } : { status } },
      { returnDocument: 'after', session },
    );
    if (!updated) {
      const current = await Order.findOne(filter).select('status').session(session);
      if (!current) throw new AppError(404, '找不到此訂單');
      if (current.status === status) throw new AppError(400, `訂單已經是「${status}」`);
      throw new AppError(400, `訂單狀態為「${current.status}」，無法${cancelling ? '取消' : `改為「${status}」`}`);
    }
    if (cancelling) {
      for (const { product, quantity } of updated.items) {
        await Product.updateOne({ _id: product }, { $inc: { stock: quantity } }, { session });
      }
    }
    return updated;
  });
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
  const order = await changeOrderStatus({ _id: req.params.id }, status);
  res.json({ success: true, message: `訂單狀態已更新為「${status}」`, data: toDTO(order) });
}
