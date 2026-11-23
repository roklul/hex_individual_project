import mongoose from 'mongoose';

export const PAYMENT_METHODS = Object.freeze(['貨到付款', 'ATM 轉帳']);
export const ORDER_STATUS = Object.freeze(['待付款', '處理中', '已出貨', '已完成', '已取消']);
export const CANCELLABLE_STATUS = Object.freeze(['待付款', '處理中']);

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
  },
  { timestamps: true },
);

orderSchema.index({ user: 1, createdAt: -1 });

export const Order = mongoose.model('Order', orderSchema);
