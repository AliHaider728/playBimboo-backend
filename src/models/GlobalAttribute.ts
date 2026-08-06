import mongoose, { Schema, Document } from 'mongoose';

export interface IGlobalAttributeTerm {
  id: string;
  label: string;
  slug: string;
  value: string;
  colorValue?: string;
  imageUrl?: string;
  imageAlt?: string;
  position: number;
  isArchived?: boolean;
}

export interface IGlobalAttribute extends Document {
  id: string;
  name: string;
  slug: string;
  displayType: 'dropdown' | 'buttons' | 'radio' | 'color_swatches' | 'image_swatches';
  terms: IGlobalAttributeTerm[];
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const GlobalAttributeTermSchema = new Schema<IGlobalAttributeTerm>(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    slug: { type: String, required: true },
    value: { type: String, required: true },
    colorValue: { type: String },
    imageUrl: { type: String },
    imageAlt: { type: String },
    position: { type: Number, default: 0 },
    isArchived: { type: Boolean, default: false }
  },
  { _id: false }
);

const GlobalAttributeSchema = new Schema<IGlobalAttribute>(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    displayType: { 
      type: String, 
      enum: ['dropdown', 'buttons', 'radio', 'color_swatches', 'image_swatches'], 
      default: 'buttons' 
    },
    terms: [GlobalAttributeTermSchema],
    isArchived: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export default mongoose.model<IGlobalAttribute>('GlobalAttribute', GlobalAttributeSchema);
