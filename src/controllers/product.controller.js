import { Product, CATEGORIES } from '../models/Product.js';
import { Cart } from '../models/Cart.js';
import { AppError } from '../utils/AppError.js';
import { escapeRegex } from '../utils/escapeRegex.js';

const SORTS = {
  newest: { createdAt: -1, _id: -1 },
  price_asc: { price: 1, _id: 1 },
  price_desc: { price: -1, _id: -1 },
};

function buildFilter({ category, keyword }, base = {}) {
  const filter = { ...base };
  if (category) filter.category = category;
  if (keyword) {
    const re = new RegExp(escapeRegex(keyword), 'i');
    filter.$or = [{ title: re }, { brand: re }, { description: re }];
  }
  return filter;
}

export async function listProducts(req, res) {
  const { page, limit, sort } = req.validated.query;
  const filter = buildFilter(req.validated.query, { isEnabled: true });

  const [total, products] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter).sort(SORTS[sort]).skip((page - 1) * limit).limit(limit).lean(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  res.json({
    success: true,
    data: products.map(toDTO),
    pagination: { page, limit, total, totalPages, hasPrev: page > 1, hasNext: page < totalPages },
  });
}

export async function listCategories(_req, res) {
  const counts = await Product.aggregate([
    { $match: { isEnabled: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);
  const map = Object.fromEntries(counts.map((c) => [c._id, c.count]));
  res.json({ success: true, data: CATEGORIES.map((name) => ({ name, count: map[name] || 0 })) });
}

export async function getProduct(req, res) {
  const product = await Product.findOne({ _id: req.params.id, isEnabled: true }).lean();
  if (!product) throw new AppError(404, '找不到此商品');
  res.json({ success: true, data: toDTO(product) });
}

/* ---------- 管理員 ---------- */

export async function adminListProducts(req, res) {
  const { page, limit } = req.validated.query;
  const filter = buildFilter(req.validated.query);
  const [total, products] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter).sort(SORTS.newest).skip((page - 1) * limit).limit(limit).lean(),
  ]);
  res.json({
    success: true,
    data: products.map(toDTO),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}

export async function createProduct(req, res) {
  const product = await Product.create(req.validated.body);
  res.status(201).json({ success: true, message: '商品已新增', data: toDTO(product.toObject()) });
}

export async function updateProduct(req, res) {
  const product = await Product.findByIdAndUpdate(req.params.id, req.validated.body, {
    new: true,
    runValidators: true,
  }).lean();
  if (!product) throw new AppError(404, '找不到此商品');
  res.json({ success: true, message: '商品已更新', data: toDTO(product) });
}

export async function deleteProduct(req, res) {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) throw new AppError(404, '找不到此商品');
  // 同步把此商品從所有購物車移除
  await Cart.updateMany(
    { 'items.product': product._id },
    { $pull: { items: { product: product._id } }, $inc: { __v: 1 } },
  );
  res.json({ success: true, message: '商品已刪除' });
}

function toDTO(p) {
  const { _id, __v, ...rest } = p;
  return { id: _id, ...rest };
}
