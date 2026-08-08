import mongoose, { Schema, Document } from 'mongoose';

export interface IReview extends Document {
  productId: string; // product MongoDB _id or slug
  productName: string; // denormalized for easy listing
  reviewerName: string;
  reviewerEmail?: string;
  rating: number; // 1 to 5
  title?: string;
  content: string;
  avatarUrl?: string;
  imageUrl?: string;
  imagePublicId?: string;
  verifiedPurchase: boolean;
  source: 'customer' | 'admin';
  status: 'pending' | 'approved' | 'rejected';
  userId?: string;
  orderId?: string;
  approvedAt?: Date;
  approvedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Legacy fields for backward compatibility mapping
  authorName?: string;
  authorEmail?: string;
  comment?: string;
  isApproved?: boolean;
}

const ReviewSchema = new Schema<IReview>(
  {
    productId: { type: String, required: true, index: true },
    productName: { type: String, required: true },
    reviewerName: { type: String, required: true },
    reviewerEmail: { type: String },
    rating: { type: Number, required: true, min: 1, max: 5, index: true },
    title: { type: String },
    content: { type: String, required: true },
    avatarUrl: { type: String },
    imageUrl: { type: String },
    imagePublicId: { type: String },
    verifiedPurchase: { type: Boolean, default: false },
    source: { type: String, enum: ['customer', 'admin'], default: 'customer' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    userId: { type: String },
    orderId: { type: String },
    approvedAt: { type: Date },
    approvedBy: { type: String },
    
    // Legacy fields - kept so Mongoose can read old documents during migration
    authorName: { type: String },
    authorEmail: { type: String },
    comment: { type: String },
    isApproved: { type: Boolean }
  },
  { timestamps: true }
);

// Pre-save hook to handle backward compatibility / migration for existing data read into memory
ReviewSchema.pre('save', function (next) {
  // Migrate legacy fields to new fields
  if (this.authorName && !this.reviewerName) {
    this.reviewerName = this.authorName;
    this.authorName = undefined;
  }
  if (this.authorEmail && !this.reviewerEmail) {
    this.reviewerEmail = this.authorEmail;
    this.authorEmail = undefined;
  }
  if (this.comment && !this.content) {
    this.content = this.comment;
    this.comment = undefined;
  }
  if (this.isApproved !== undefined) {
    if (this.isApproved === true && this.status === 'pending') {
      this.status = 'approved';
    } else if (this.isApproved === false && this.status === 'pending') {
      this.status = 'pending'; // Actually remains pending, old schema didn't have rejected
    }
    this.isApproved = undefined;
  }
  
  // Basic validation constraints
  if (this.rating > 5) this.rating = 5;
  if (this.rating < 1) this.rating = 1;
  this.rating = Math.floor(this.rating);
  
  next();
});

export default mongoose.model<IReview>('Review', ReviewSchema);
