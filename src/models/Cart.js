import mongoose from 'mongoose';

export const MAX_QTY_PER_ITEM = 99;

const cartItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1, max: MAX_QTY_PER_ITEM },
  },
  { _id: false, timestamps: { createdAt: 'addedAt', updatedAt: false } },
);

const cartSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true, optimisticConcurrency: true },
);

export const Cart = mongoose.model('Cart', cartSchema);
