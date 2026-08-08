require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/playbimboo');
  console.log('Connected to DB');
  
  const products = await mongoose.connection.collection('products').find({}).toArray();
  let updated = 0;
  for (const p of products) {
    if (p.soldCount === undefined || p.soldCount === null) {
      const randomSold = Math.floor(Math.random() * (500 - 50 + 1)) + 50;
      await mongoose.connection.collection('products').updateOne(
        { _id: p._id },
        { $set: { soldCount: randomSold } }
      );
      updated++;
    }
  }
  console.log(`Updated ${updated} products with random soldCount`);
  process.exit(0);
}
run();
