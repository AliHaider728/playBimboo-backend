import mongoose, { Schema, Document } from 'mongoose';

export interface ICategory extends Document {
  name: string;
  slug: string;
  iconName: string;
  image: string;
  description: string;
  itemCount: number;
  deliveryCharge?: number;
}

const CategorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    iconName: { type: String, default: 'Boxes' },
    image: { type: String, required: true },
    description: { type: String, required: true },
    itemCount: { type: Number, default: 0 },
    deliveryCharge: { type: Number }
  },
  { timestamps: true }
);

export default mongoose.model<ICategory>('Category', CategorySchema);
