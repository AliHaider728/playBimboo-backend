import mongoose, { Schema, Document } from 'mongoose';

export interface IProductVariantOption {
  id: string;
  name: string;
  priceOffset?: number;
  inStock?: boolean;
  stockQuantity?: number;
  sku?: string;
}

export interface IProductVariantGroup {
  id: string;
  name: string; // e.g., "Color", "Size"
  options: IProductVariantOption[];
}

export interface IProduct extends Document {
  name: string;
  slug: string;
  sku?: string;
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
  shortDescription?: string;
  description: string;
  isVisible: boolean;
  status: 'draft' | 'published';
  isFeatured: boolean;
  lowStockThreshold?: number;
  weight?: number;
  deliveryType?: 'store_threshold' | 'category' | 'fixed' | 'free' | 'none';
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
    sku: { type: String, trim: true, uppercase: true, unique: true, sparse: true },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, min: 0 },
    discountPercent: { type: Number, default: 0 },
    rating: { type: Number, default: 5.0 },
    reviewCount: { type: Number, default: 0 },
    category: { type: String, required: true },
    categorySlug: { type: String, required: true },
    ageGroup: { type: String, required: true },
    brand: { type: String, default: 'PlayBimboo' },
    inStock: { type: Boolean, default: true },
    stockQuantity: { type: Number, default: 10, min: 0 },
    lowStockThreshold: { type: Number, min: 0 },
    images: {
      type: [{ type: String }],
      validate: {
        validator: (images: string[]) => images.length <= 9,
        message: 'A product can have one main image and up to 8 gallery images'
      }
    },
    shortDescription: { type: String, maxlength: 300 },
    description: { type: String, required: true },
    isVisible: { type: Boolean, default: true },
    status: { type: String, enum: ['draft', 'published'], default: 'published' },
    isFeatured: { type: Boolean, default: false },
    weight: { type: Number, min: 0 },
    deliveryType: { type: String, enum: ['store_threshold', 'category', 'fixed', 'free', 'none'], default: 'store_threshold' },
    customDeliveryFee: { type: Number, min: 0 },
    variants: [
      {
        id: String,
        name: String,
        options: [
          {
            id: String,
            name: String,
            priceOffset: Number,
            inStock: Boolean,
            stockQuantity: { type: Number, min: 0 },
            sku: { type: String, trim: true, uppercase: true }
          }
        ]
      }
    ],
    features: [{ type: String }],
    safetyInfo: { type: String },
    specifications: { type: Schema.Types.Mixed },
    tags: [{ type: String }],
    metaTitle: { type: String, maxlength: 70 },
    metaDescription: { type: String, maxlength: 180 }
  },
  { timestamps: true }
);

export default mongoose.model<IProduct>('Product', ProductSchema);
