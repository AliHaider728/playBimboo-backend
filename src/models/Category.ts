import mongoose, { Schema, Document } from 'mongoose';

export interface ICategory extends Document {
  name: string;
  slug: string;
  iconName: string;
  image: string;
  imagePublicId?: string;
  shortDescription: string;
  description?: string;
  itemCount: number;
  deliveryCharge?: number;
  isActive: boolean;
  isFeatured: boolean;
  showInNavigation: boolean;
  navigationLabel?: string;
  displayOrder: number;
  parentCategoryId?: string;
  seoTitle?: string;
  metaDescription?: string;
  desktopVisible: boolean;
  mobileVisible: boolean;
}

const CategorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, unique: true, trim: true, maxlength: 120 },
    iconName: { type: String, default: 'Boxes', maxlength: 50 },
    image: { type: String, default: '' },
    imagePublicId: { type: String },
    shortDescription: { type: String, default: '', maxlength: 240 },
    description: { type: String, maxlength: 2000 },
    itemCount: { type: Number, default: 0, min: 0 },
    deliveryCharge: { type: Number, min: 0 },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    showInNavigation: { type: Boolean, default: true },
    navigationLabel: { type: String, maxlength: 50 },
    displayOrder: { type: Number, default: 0, min: 0 },
    parentCategoryId: { type: String },
    seoTitle: { type: String, maxlength: 70 },
    metaDescription: { type: String, maxlength: 180 },
    desktopVisible: { type: Boolean, default: true },
    mobileVisible: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export default mongoose.model<ICategory>('Category', CategorySchema);
