import mongoose, { Schema, Document } from 'mongoose';

export interface IOrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  selectedVariant?: string; // Legacy
  variationId?: string;
  productType?: 'simple' | 'variable';
  sku?: string;
  selectedAttributes?: Record<string, string>;
}

export interface IShippingAddress {
  fullName: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  country?: string;
}

export interface IOrder extends Document {
  userId?: mongoose.Types.ObjectId;
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
  checkoutRequestId?: string;
  date: string;
  confirmationEmailSentAt?: Date;
  confirmationEmailMessageId?: string;
  confirmationEmailAccepted?: boolean;
  confirmationEmailFailedAt?: Date;
  confirmationEmailFailureCode?: string;
  deliveredAt?: Date;
  deliveredEmailSentAt?: Date;
  deliveredEmailMessageId?: string;
  deliveredEmailAccepted?: boolean;
  deliveredEmailFailedAt?: Date;
  deliveredEmailFailureCode?: string;
  shippedEmailSentAt?: Date;
  newOrderEmailSentAt?: Date;
  newOrderEmailMessageId?: string;
  newOrderEmailError?: string;
  newOrderEmailRecipients?: string[];
  newOrderEmailAttemptedAt?: Date;
  createdAt: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    orderId: { type: String, required: true, unique: true },
    customerName: { type: String, required: true },
    email: { type: String, trim: true, default: '' },
    phone: { type: String, required: true },
    items: [
      {
        productId: String,
        name: String,
        price: Number,
        quantity: Number,
        image: String,
        selectedVariant: String, // Legacy
        variationId: String,
        productType: { type: String, enum: ['simple', 'variable'] },
        sku: String,
        selectedAttributes: { type: Map, of: String }
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
      phone: String,
      country: String
    },
    trackingNumber: { type: String },
    appliedCoupon: { type: String },
    checkoutRequestId: { type: String, trim: true, maxlength: 120, unique: true, sparse: true },
    date: { type: String },
    confirmationEmailSentAt: { type: Date },
    confirmationEmailMessageId: { type: String, maxlength: 500 },
    confirmationEmailAccepted: { type: Boolean },
    confirmationEmailFailedAt: { type: Date },
    confirmationEmailFailureCode: { type: String, maxlength: 100 },
    deliveredAt: { type: Date },
    deliveredEmailSentAt: { type: Date },
    deliveredEmailMessageId: { type: String, maxlength: 500 },
    deliveredEmailAccepted: { type: Boolean },
    deliveredEmailFailedAt: { type: Date },
    deliveredEmailFailureCode: { type: String, maxlength: 100 },
    newOrderEmailSentAt: { type: Date },
    newOrderEmailMessageId: { type: String, maxlength: 500 },
    newOrderEmailError: { type: String, maxlength: 100 },
    newOrderEmailRecipients: [{ type: String }],
    newOrderEmailAttemptedAt: { type: Date }
  },
  { timestamps: true }
);

export default mongoose.model<IOrder>('Order', OrderSchema);
