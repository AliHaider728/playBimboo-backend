import mongoose, { Schema, Document } from 'mongoose';

export interface IProductVariantOption {
  id: string;
  name: string;
  priceOffset?: number;
  inStock?: boolean;
}

export interface IProductVariantGroup {
  id: string;
  name: string; // e.g., "Color", "Size"
  options: IProductVariantOption[];
}

export interface IProduct extends Document {
  name: string;
  slug: string;
  price: number;
  originalPrice?: number;
  discountPercent?: number;
  rating: number;
  reviewCount: number;
  category: string;
  categorySlug: string;
  ageGroup: string;
  brand: string;
  inStock: boolean;
  stockQuantity: number;
  images: string[];
  description: string;
  isVisible: boolean;
  deliveryType?: 'store_threshold' | 'category' | 'fixed' | 'free';
  customDeliveryFee?: number;
  variants?: IProductVariantGroup[];
  features?: string[];
  safetyInfo?: string;
  specifications?: Record<string, string>;
  tags?: string[];
  metaTitle?: string;
  metaDescription?: string;
  createdAt: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    price: { type: Number, required: true },
    originalPrice: { type: Number },
    discountPercent: { type: Number, default: 0 },
    rating: { type: Number, default: 5.0 },
    reviewCount: { type: Number, default: 0 },
    category: { type: String, required: true },
    categorySlug: { type: String, required: true },
    ageGroup: { type: String, required: true },
    brand: { type: String, default: 'PlayBimboo' },
    inStock: { type: Boolean, default: true },
    stockQuantity: { type: Number, default: 10 },
    images: [{ type: String }],
    description: { type: String, required: true },
    isVisible: { type: Boolean, default: true },
    deliveryType: { type: String, enum: ['store_threshold', 'category', 'fixed', 'free'], default: 'store_threshold' },
    customDeliveryFee: { type: Number },
    variants: [
      {
        id: String,
        name: String,
        options: [
          {
            id: String,
            name: String,
            priceOffset: Number,
            inStock: Boolean
          }
        ]
      }
    ],
    features: [{ type: String }],
    safetyInfo: { type: String },
    specifications: { type: Schema.Types.Mixed },
    tags: [{ type: String }],
    metaTitle: { type: String },
    metaDescription: { type: String }
  },
  { timestamps: true }
);

export default mongoose.model<IProduct>('Product', ProductSchema);
