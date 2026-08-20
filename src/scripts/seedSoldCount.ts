import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const run = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGODB_URI is missing');
    await mongoose.connect(mongoUri);
    console.log('Connected to DB');

    const collection = mongoose.connection.collection('products');
    const products = await collection.find({}).toArray();
    let updated = 0;
    
    for (const p of products) {
      if (p.soldCount === undefined || p.soldCount === null) {
        const randomSold = Math.floor(Math.random() * (500 - 50 + 1)) + 50;
        await collection.updateOne(
          { _id: p._id },
          { $set: { soldCount: randomSold } }
        );
        updated++;
      }
    }
    console.log(`Updated ${updated} products with random soldCount`);
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error(err);
    await mongoose.connection.close();
    process.exit(1);
  }
};

run();
