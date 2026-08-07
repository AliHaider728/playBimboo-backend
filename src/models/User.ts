import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: 'super_admin' | 'admin' | 'customer';
  wishlist?: string[];
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['super_admin', 'admin', 'customer'], default: 'customer' },
    wishlist: [{ type: String }],
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date }
  },
  { timestamps: true }
);

export default mongoose.model<IUser>('User', UserSchema);
