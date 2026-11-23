import mongoose from 'mongoose';

export const CATEGORIES = Object.freeze(['微控制器・處理器', '邏輯・介面IC', '類比・驅動IC', '電源・穩壓', '光耦・繼電器', '開關・連接器', '模組・配件']);

const productSchema = new mongoose.Schema(
  {
    catalogKey: { type: String, unique: true, sparse: true, select: false },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    brand: { type: String, default: '', trim: true, maxlength: 50 },
    description: { type: String, default: '', maxlength: 2000 },
    content: { type: String, default: '', maxlength: 5000 },
    category: { type: String, required: true, enum: CATEGORIES },
    price: { type: Number, required: true, min: 0 },
    originPrice: { type: Number, min: 0 },
    unit: { type: String, default: '顆', maxlength: 10 },
    imageUrl: { type: String, required: true },
    imagesUrl: { type: [String], default: [] },
    stock: { type: Number, required: true, min: 0, default: 0 },
    isEnabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

productSchema.index({ category: 1, createdAt: -1 });


export const Product = mongoose.model('Product', productSchema);
