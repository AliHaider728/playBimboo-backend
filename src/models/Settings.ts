import mongoose, { Schema, Document } from 'mongoose';

export interface ISettings extends Document {
  storeName: string;
  email: string;
  phone: string;
  address: string;
  currency: string;
  freeShippingThreshold: number;
  standardShippingFee: number;
  taxRate: number;
  defaultMetaTitle: string;
  defaultMetaDescription: string;
}

const SettingsSchema = new Schema<ISettings>(
  {
    storeName: { type: String, default: 'PlayBimboo' },
    email: { type: String, default: 'support@playbimboo.com' },
    phone: { type: String, default: '+92 300 1234567' },
    address: { type: String, default: 'Gulberg III, Lahore, Pakistan' },
    currency: { type: String, default: 'Rs.' },
    freeShippingThreshold: { type: Number, default: 3000 },
    standardShippingFee: { type: Number, default: 200 },
    taxRate: { type: Number, default: 0 },
    defaultMetaTitle: { type: String, default: 'PlayBimboo - Premium Educational & Fun Toys for Kids' },
    defaultMetaDescription: { type: String, default: 'Discover high quality building blocks, STEM kits, action figures, and educational plush toys at PlayBimboo.' }
  },
  { timestamps: true }
);

export default mongoose.model<ISettings>('Settings', SettingsSchema);
