import mongoose, { Schema, Document } from 'mongoose';
import {
  DEFAULT_HOMEPAGE_SECTIONS,
  DEFAULT_STOREFRONT_NAVIGATION,
  HomepageSectionSetting,
  StorefrontNavigationItem
} from '../config/storeAppearance.js';

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
  storefrontNavigation: StorefrontNavigationItem[];
  homepageSections: HomepageSectionSetting[];
}

const StorefrontNavigationSchema = new Schema<StorefrontNavigationItem>({
  id: { type: String, required: true, maxlength: 80 },
  key: { type: String, required: true },
  label: { type: String, required: true, maxlength: 50 },
  linkType: { type: String, enum: ['internal_page', 'category', 'custom_internal_url', 'external_url'], required: true },
  menuType: { type: String, enum: ['link', 'dropdown'], default: 'link' },
  path: { type: String, maxlength: 200 },
  externalUrl: { type: String, maxlength: 500 },
  categoryId: { type: String },
  parentId: { type: String, default: null },
  visible: { type: Boolean, default: true },
  enabled: { type: Boolean, default: true },
  showOnDesktop: { type: Boolean, default: true },
  showOnMobile: { type: Boolean, default: true },
  displayOrder: { type: Number, required: true, min: 0 },
  order: { type: Number, min: 0 },
  badgeText: { type: String, maxlength: 20 },
  openInNewTab: { type: Boolean, default: false },
  isSystemItem: { type: Boolean, default: false }
}, { _id: false });

const HomepageSectionSchema = new Schema<HomepageSectionSetting>({
  key: { type: String, required: true },
  name: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  order: { type: Number, required: true, min: 0 },
  heading: { type: String, maxlength: 120 },
  subheading: { type: String, maxlength: 320 },
  ctaLabel: { type: String, maxlength: 60 },
  ctaLink: { type: String, maxlength: 200 }
}, { _id: false });

const SettingsSchema = new Schema<ISettings>(
  {
    storeName: { type: String, default: 'PlayBimboo' },
    email: { type: String, default: 'sales@playbimboo.com' },
    phone: { type: String, default: '+327-6655557' },
    address: { type: String, default: 'Mumtaz Market, Shafique Center, Gujranwala, Pakistan' },
    currency: { type: String, default: 'Rs.' },
    freeShippingThreshold: { type: Number, default: 3000 },
    standardShippingFee: { type: Number, default: 200 },
    taxRate: { type: Number, default: 0 },
    defaultMetaTitle: { type: String, default: 'PlayBimboo - Premium Educational & Fun Toys for Kids' },
    defaultMetaDescription: { type: String, default: 'Discover high quality building blocks, STEM kits, action figures, and educational plush toys at PlayBimboo.' },
    storefrontNavigation: {
      type: [StorefrontNavigationSchema],
      default: () => DEFAULT_STOREFRONT_NAVIGATION.map(item => ({ ...item }))
    },
    homepageSections: {
      type: [HomepageSectionSchema],
      default: () => DEFAULT_HOMEPAGE_SECTIONS.map(item => ({ ...item }))
    }
  },
  { timestamps: true }
);

export default mongoose.model<ISettings>('Settings', SettingsSchema);
