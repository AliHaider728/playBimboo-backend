import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './src/models/Product';
import Settings from './src/models/Settings';
import Coupon from './src/models/Coupon';

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/playbimboo');
  
  const products = await Product.find({});
  for (const p of products) {
    let changed = false;
    if (p.price < 300) {
      if (p.price % 1 !== 0) p.price = Math.floor(p.price) * 100 + 99;
      else p.price = p.price * 100;
      changed = true;
    }
    if (p.originalPrice && p.originalPrice < 300) {
      if (p.originalPrice % 1 !== 0) p.originalPrice = Math.floor(p.originalPrice) * 100 + 99;
      else p.originalPrice = p.originalPrice * 100;
      changed = true;
    }
    if (changed) await p.save();
  }

  const coupons = await Coupon.find({});
  for (const c of coupons) {
    if (c.minSpend < 300) {
      c.minSpend = c.minSpend * 100;
      await c.save();
    }
  }

  const settings = await Settings.findOne({});
  if (settings && settings.freeShippingThreshold === 50) {
    settings.freeShippingThreshold = 5000;
    await settings.save();
  }
  
  console.log('Database successfully migrated!');
  process.exit(0);
}

run().catch(console.error);
