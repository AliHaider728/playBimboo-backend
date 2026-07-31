import mongoose, { Schema, Document } from 'mongoose';

export interface IOrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  selectedVariant?: string;
}

export interface IShippingAddress {
  fullName: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
}

export interface IOrder extends Document {
  orderId: string; // e.g. "ORD-92841"
  customerName: string;
  email: string;
  phone: string;
  items: IOrderItem[];
  subtotal: number;
  deliveryCharge: number;
  discountAmount: number;
  total: number;
  status: 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';
  paymentMethod: 'Cash on Delivery (COD)';
  shippingAddress: IShippingAddress;
  trackingNumber?: string;
  appliedCoupon?: string;
  date: string;
  createdAt: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    orderId: { type: String, required: true, unique: true },
    customerName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    items: [
      {
        productId: String,
        name: String,
        price: Number,
        quantity: Number,
        image: String,
        selectedVariant: String
      }
    ],
    subtotal: { type: Number, required: true },
    deliveryCharge: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    status: {
      type: String,
      enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
      default: 'Pending'
    },
    paymentMethod: { type: String, default: 'Cash on Delivery (COD)' },
    shippingAddress: {
      fullName: String,
      street: String,
      city: String,
      state: String,
      postalCode: String,
      phone: String
    },
    trackingNumber: { type: String },
    appliedCoupon: { type: String },
    date: { type: String }
  },
  { timestamps: true }
);

export default mongoose.model<IOrder>('Order', OrderSchema);
