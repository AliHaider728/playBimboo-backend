import mongoose, { Schema, Document } from 'mongoose';

export interface ICoupon extends Document {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number; // e.g., 10 for 10% or 500 for Rs. 500
  minPurchase?: number;
  isActive: boolean;
  expiryDate?: string;
  usageLimit?: number;
  usageCount: number;
}

const CouponSchema = new Schema<ICoupon>(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
    discountValue: { type: Number, required: true },
    minPurchase: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    expiryDate: { type: String },
    usageLimit: { type: Number },
    usageCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export default mongoose.model<ICoupon>('Coupon', CouponSchema);
