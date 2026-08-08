import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Review from '../models/Review.js';
import Product from '../models/Product.js';

dotenv.config();

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGO_URI is not defined in environment variables.');
  process.exit(1);
}

const firstNames = ['Sarah', 'Michael', 'Emily', 'David', 'Jessica', 'James', 'Ashley', 'John', 'Amanda', 'Robert', 'Jennifer', 'William', 'Elizabeth', 'Richard', 'Melissa', 'Thomas'];
const lastNames = ['M.', 'T.', 'R.', 'S.', 'L.', 'B.', 'C.', 'D.', 'K.', 'P.', 'W.', 'H.'];

const reviewTemplates = [
  { title: "Kids love it!", text: "Bought this for my 5 year old and they haven't stopped playing with it since it arrived. Great quality.", rating: 5 },
  { title: "Highly recommend", text: "Very well made and safe. No sharp edges. Exactly as described.", rating: 5 },
  { title: "Good quality, fast shipping", text: "Arrived earlier than expected. The packaging was nice and the product is durable.", rating: 4 },
  { title: "Perfect gift", text: "Got this for my niece's birthday. She absolutely adores it. Worth every penny.", rating: 5 },
  { title: "Nice toy, but a bit small", text: "It's a great toy, but smaller than I anticipated. Still, my son enjoys it.", rating: 4 },
  { title: "A hit in our household", text: "Both my kids (3 and 6) fight over this. Might need to buy another one!", rating: 5 },
  { title: "Great educational value", text: "Not only is it fun, but it really makes them think. Love STEM toys like this.", rating: 5 },
  { title: "Sturdy and safe", text: "I don't have to worry about small parts breaking off. Very solid construction.", rating: 5 },
  { title: "Okay, but could be better", text: "The colors are a bit faded compared to the pictures, but structurally it's fine.", rating: 3 },
  { title: "Best purchase this year", text: "Cannot recommend this enough. It keeps them entertained for hours.", rating: 5 }
];

async function seedReviews() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI as string);
    console.log('Connected.');

    const products = await Product.find({}, '_id name').lean();
    console.log(`Found ${products.length} products.`);

    if (products.length === 0) {
      console.log('No products found to review.');
      process.exit(0);
    }

    const totalReviews = 40;
    console.log(`Generating ${totalReviews} reviews...`);
    
    let createdCount = 0;

    for (let i = 0; i < totalReviews; i++) {
      const product = products[Math.floor(Math.random() * products.length)];
      const template = reviewTemplates[Math.floor(Math.random() * reviewTemplates.length)];
      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
      const reviewerName = `${firstName} ${lastName}`;
      
      let rating = template.rating;
      if (Math.random() > 0.8 && rating > 3) rating -= 1;

      const reviewData = {
        productId: String(product._id),
        productName: product.name,
        reviewerName,
        rating,
        title: template.title,
        content: template.text,
        verifiedPurchase: Math.random() > 0.3,
        status: 'approved',
        source: 'admin'
      };

      await Review.create(reviewData);
      createdCount++;
      process.stdout.write('.');
    }

    console.log(`\nSuccessfully created ${createdCount} reviews.`);
    process.exit(0);

  } catch (error: any) {
    console.error('\nSeeding failed:', error.message);
    process.exit(1);
  }
}

seedReviews();
