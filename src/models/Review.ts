import mongoose, { Schema, Document } from 'mongoose';

export interface IReview extends Document {
  productId: string; // product MongoDB _id or slug
  productName: string;
  authorName: string;
  authorEmail?: string;
  rating: number; // 1 to 5
  comment: string;
  isApproved: boolean;
  createdAt: Date;
}

const ReviewSchema = new Schema<IReview>(
  {
    productId: { type: String, required: true, index: true },
    productName: { type: String, required: true },
    authorName: { type: String, required: true },
    authorEmail: { type: String },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
    isApproved: { type: Boolean, default: true } // Auto-approved or pending admin review
  },
  { timestamps: true }
);

export default mongoose.model<IReview>('Review', ReviewSchema);
