import mongoose, { Schema, Document } from 'mongoose';
import { ProductDetailBlock, SupportedAgeGroup } from '../lib/productContent.js';

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
  ageGroup?: string;
  ageGroups: SupportedAgeGroup[];
  brand: string;
  inStock: boolean;
  stockQuantity: number;
  images: string[];
  imagePublicIds: string[];
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
  productDetailBlocks: ProductDetailBlock[];
  productDetailCustomCss?: string;
  productDetailScopedCss?: string;
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
    // ageGroup remains readable for old production documents while ageGroups is
    // the canonical field for all new writes.
    ageGroup: { type: String },
    ageGroups: {
      type: [{ type: String, enum: ['0-2', '3-5', '6-8', '9-12', '13+'] }],
      default: undefined,
      validate: {
        validator: (groups?: string[]) => !groups || groups.length > 0,
        message: 'Select at least one supported age group'
      }
    },
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
    imagePublicIds: {
      type: [{ type: String }],
      default: [],
      validate: {
        validator: (publicIds: string[]) => publicIds.length <= 9,
        message: 'A product can have at most 9 Cloudinary image public IDs'
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
    metaDescription: { type: String, maxlength: 180 },
    productDetailBlocks: {
      type: [new Schema({
        id: { type: String, required: true, maxlength: 80 },
        type: { type: String, required: true, enum: ['richText', 'image', 'html', 'divider'] },
        enabled: { type: Boolean, default: true },
        order: { type: Number, required: true, min: 0 },
        heading: { type: String, maxlength: 140 },
        content: { type: String, maxlength: 30000 },
        image: {
          secureUrl: { type: String },
          publicId: { type: String },
          alt: { type: String, maxlength: 180 },
          caption: { type: String, maxlength: 300 }
        },
        settings: {
          width: { type: String, enum: ['full', 'large', 'medium'], default: 'full' },
          alignment: { type: String, enum: ['left', 'center', 'right'], default: 'center' }
        }
      }, { _id: false })],
      default: []
    },
    productDetailCustomCss: { type: String, maxlength: 10000 },
    productDetailScopedCss: { type: String, maxlength: 30000 }
  },
  { timestamps: true }
);

export default mongoose.model<IProduct>('Product', ProductSchema);
