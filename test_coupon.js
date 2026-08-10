
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const CouponSchema = new mongoose.Schema({}, { strict: false });
  const Coupon = mongoose.model('Coupon', CouponSchema, 'coupons');
  const coupons = await Coupon.find();
  console.log(JSON.stringify(coupons, null, 2));
  process.exit(0);
});

