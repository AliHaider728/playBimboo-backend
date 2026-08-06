import mongoose, { Schema, Document } from 'mongoose';
import { ProductDetailBlock, SupportedAgeGroup } from '../lib/productContent.js';

export interface IProductAttributeTerm {
  id: string; // matches globalTermId if global, or custom id
  label: string;
  slug: string;
  value: string;
  colorValue?: string;
  imageUrl?: string;
  imageAlt?: string;
  position: number;
}

export interface IProductAttribute {
  source: 'global' | 'custom';
  globalAttributeId?: string; // only if source === 'global'
  id: string;
  name: string;
  slug: string;
  displayType: 'dropdown' | 'buttons' | 'radio' | 'color_swatches' | 'image_swatches';
  terms: IProductAttributeTerm[]; // Replaces string values
  selectedTermIds?: string[]; // IDs of terms selected for this product
  visible: boolean;
  usedForVariations: boolean;
  position: number;
  displayTypeOverride?: string; // Optional override for global
}

export interface IProductVariation {
  id: string;
  attributes: Record<string, string>;
  enabled: boolean;
  sku?: string;
  regularPrice: number;
  salePrice?: number;
  image?: string;
  manageStock: boolean;
  stockQuantity?: number | null;
  lowStockThreshold?: number | null;
  stockStatus: 'in_stock' | 'out_of_stock';
  weight?: number;
  dimensions?: { length: number; width: number; height: number };
  description?: string;
}
export interface IProductVariantOption {
  id: string;
  name: string;
  priceOffset?: number;
  inStock?: boolean;
  trackInventory?: boolean;
  stockQuantity?: number | null;
  stockStatus?: 'in_stock' | 'out_of_stock';
  lowStockThreshold?: number | null;
  sku?: string;
}

export interface IProductVariantGroup {
  id: string;
  name: string; // e.g., "Color", "Size"
  options: IProductVariantOption[];
}

export interface IProduct extends Document {
  productType: 'simple' | 'variable';
  attributes?: IProductAttribute[];
  variations?: IProductVariation[];
  defaultAttributes?: Record<string, string>;
  name: string;
  slug: string;
  sku?: string;
  price: number;
  originalPrice?: number;
  discountPercent?: number;
  rating: number;
  reviewCount: number;
  category?: string;
  categorySlug?: string;
  categoryId?: string;
  ageGroup?: string;
  ageGroups: SupportedAgeGroup[];
  brand: string;
  inStock: boolean;
  trackInventory?: boolean;
  stockQuantity?: number | null;
  stockStatus?: 'in_stock' | 'out_of_stock';
  images: string[];
  imagePublicIds: string[];
  shortDescription?: string;
  description: string;
  isVisible: boolean;
  status: 'draft' | 'published';
  isFeatured: boolean;
  lowStockThreshold?: number | null;
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
  sizeGuide?: string;
  productSchemaVersion?: number;
  createdAt: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    productSchemaVersion: { type: Number, default: 2 },
    productType: { type: String, enum: ['simple', 'variable'], default: 'simple' },
    attributes: [
      {
        source: { type: String, enum: ['global', 'custom'], default: 'custom' },
        globalAttributeId: { type: String },
        id: { type: String, required: true },
        name: { type: String, required: true },
        slug: { type: String, required: true },
        displayType: { type: String, enum: ['dropdown', 'buttons', 'radio', 'color_swatches', 'image_swatches'], default: 'buttons' },
        terms: [
          {
            id: { type: String, required: true },
            label: { type: String, required: true },
            slug: { type: String, required: true },
            value: { type: String, required: true },
            colorValue: { type: String },
            imageUrl: { type: String },
            imageAlt: { type: String },
            position: { type: Number, default: 0 }
          }
        ],
        selectedTermIds: [{ type: String }],
        visible: { type: Boolean, default: true },
        usedForVariations: { type: Boolean, default: true },
        position: { type: Number, default: 0 },
        displayTypeOverride: { type: String }
      }
    ],
    variations: [
      {
        id: { type: String, required: true },
        attributes: { type: Map, of: String },
        enabled: { type: Boolean, default: true },
        sku: { type: String, trim: true, uppercase: true },
        regularPrice: { type: Number, required: true, min: 0 },
        salePrice: { type: Number, min: 0 },
        image: { type: String },
        manageStock: { type: Boolean, default: false },
        stockQuantity: { type: Number, min: 0 },
        lowStockThreshold: { type: Number, min: 0 },
        stockStatus: { type: String, enum: ['in_stock', 'out_of_stock'], default: 'in_stock' },
        weight: { type: Number, min: 0 },
        dimensions: {
          length: { type: Number, min: 0 },
          width: { type: Number, min: 0 },
          height: { type: Number, min: 0 }
        },
        description: { type: String, maxlength: 500 }
      }
    ],
    defaultAttributes: { type: Map, of: String },
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    sku: { type: String, trim: true, uppercase: true, unique: true, sparse: true },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, min: 0 },
    discountPercent: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    category: { type: String, default: '' },
    categorySlug: { type: String, default: '' },
    categoryId: { type: String, default: '' },
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
    trackInventory: { type: Boolean, default: undefined },
    stockQuantity: { type: Number, min: 0, default: undefined },
    stockStatus: { type: String, enum: ['in_stock', 'out_of_stock'], default: undefined },
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
            trackInventory: { type: Boolean, default: undefined },
            stockQuantity: { type: Number, min: 0 },
            stockStatus: { type: String, enum: ['in_stock', 'out_of_stock'], default: undefined },
            lowStockThreshold: { type: Number, min: 0 },
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
        type: { type: String, required: true },
        enabled: { type: Boolean, default: true },
        order: { type: Number, required: true, min: 0 },
        heading: { type: String, maxlength: 140 },
        content: { type: String, maxlength: 30000 },
        items: [{ type: Schema.Types.Mixed }],
        images: [{
          secureUrl: { type: String },
          publicId: { type: String },
          alt: { type: String, maxlength: 180 },
          caption: { type: String, maxlength: 300 }
        }],
        image: {
          secureUrl: { type: String },
          publicId: { type: String },
          alt: { type: String, maxlength: 180 },
          caption: { type: String, maxlength: 300 }
        },
        settings: {
          width: { type: String, enum: ['full', 'large', 'medium'], default: 'full' },
          alignment: { type: String, enum: ['left', 'center', 'right'], default: 'center' },
          background: { type: String },
          spacing: { type: String, enum: ['none', 'small', 'medium', 'large'] },
          responsiveVisibility: { type: String, enum: ['all', 'desktop', 'mobile'] },
          imagePosition: { type: String, enum: ['left', 'right'] },
          columns: { type: Number, enum: [2, 3, 4] }
        }
      }, { _id: false })],
      default: []
    },
    productDetailCustomCss: { type: String, maxlength: 10000 },
    productDetailScopedCss: { type: String, maxlength: 30000 },
    sizeGuide: { type: String }
  },
  { timestamps: true }
);

export default mongoose.model<IProduct>('Product', ProductSchema);
