import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined in environment variables.');
  process.exit(1);
}

const productSchema = new mongoose.Schema({
  name: String,
  slug: String,
  regularPrice: Number,
  images: [String],
  imagePublicIds: [String],
  imageThumbnailUrls: [String],
  imageThumbnailPublicIds: [String],
  image: Object,
  stockStatus: String,
  isVisible: Boolean,
  categoryId: String,
  stockQuantity: Number,
  description: String,
  shortDescription: String,
});

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

async function addSoldOutProduct() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI as string, {
      serverSelectionTimeoutMS: 5000
    });
    console.log('Connected.');

    const newProduct = new Product({
      name: 'Testing Sold Out Toy',
      slug: 'testing-sold-out-toy-' + Date.now(),
      regularPrice: 29.99,
      images: ['https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg'],
      imagePublicIds: ['sample'],
      imageThumbnailUrls: ['https://res.cloudinary.com/demo/image/upload/c_thumb,w_200,g_face/v1312461204/sample.jpg'],
      imageThumbnailPublicIds: ['sample'],
      image: {
        url: 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg',
        publicId: 'sample',
        alt: 'Test toy'
      },
      stockStatus: 'out_of_stock',
      stockQuantity: 0,
      isVisible: true,
      categoryId: 'toys', // arbitrary
      description: 'This is a test product created to test the Sold Out storefront display.',
      shortDescription: 'Test product for out of stock UI.',
    });

    await newProduct.save();
    console.log('Successfully created test Sold Out product with slug: ' + newProduct.slug);

  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

addSoldOutProduct();
