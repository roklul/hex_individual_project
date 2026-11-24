import mongoose from 'mongoose';

export const PAYMENT_METHODS = Object.freeze(['貨到付款', 'ATM 轉帳']);
export const ORDER_STATUS = Object.freeze(['待付款', '處理中', '已出貨', '已完成', '已取消']);
// 訂單狀態只能往前推進；取消只能在出貨前，已完成與已取消為終點
export const ORDER_STATUS_TRANSITIONS = Object.freeze({
  待付款: Object.freeze(['處理中', '已取消']),
  處理中: Object.freeze(['已出貨', '已取消']),
  已出貨: Object.freeze(['已完成']),
  已完成: Object.freeze([]),
  已取消: Object.freeze([]),
});
/** 可以轉換成 status 的來源狀態 */
export const statusesLeadingTo = (status) =>
  ORDER_STATUS.filter((from) => ORDER_STATUS_TRANSITIONS[from].includes(status));
export const CANCELLABLE_STATUS = Object.freeze(statusesLeadingTo('已取消'));

// 下單當下的商品快照：之後商品改價、改名或刪除都不影響歷史訂單
const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    title: { type: String, required: true },
    brand: String,
    imageUrl: String,
    unit: String,
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    orderNo: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: { type: [orderItemSchema], validate: (v) => v.length > 0 },
    recipient: {
      name: { type: String, required: true, trim: true, maxlength: 50 },
      phone: { type: String, required: true, trim: true },
      address: { type: String, required: true, trim: true, maxlength: 200 },
    },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    note: { type: String, default: '', maxlength: 300 },
    subtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ORDER_STATUS, default: '處理中' },
    cancelledAt: Date,
    // ATM 轉帳：買家回報的匯款帳號末五碼，供管理員對帳
    transferReport: {
      last5: { type: String, match: /^\d{5}$/ },
      reportedAt: Date,
    },
  },
  { timestamps: true },
);

orderSchema.index({ user: 1, createdAt: -1 });

export const Order = mongoose.model('Order', orderSchema);
