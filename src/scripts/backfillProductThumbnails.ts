import 'dotenv/config';
import dns from 'node:dns';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { connectToDatabase } from '../lib/database.js';
import {
  deleteProductImages,
  hasCloudinaryConfiguration,
  uploadProductThumbnail
} from '../lib/cloudinary.js';
import { createProductThumbnail } from '../lib/productImages.js';
import Product from '../models/Product.js';

const apply = process.argv.includes('--apply');
const verify = process.argv.includes('--verify');
if (process.argv.includes('--public-dns')) {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
}

const downloadImage = async (url: string) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Image download returned HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};

const main = async () => {
  if (!hasCloudinaryConfiguration) {
    throw new Error('Cloudinary configuration is required');
  }

  await connectToDatabase();
  const products = await Product.find({ images: { $exists: true, $ne: [] } })
    .select('name slug images imageThumbnailUrls imageThumbnailPublicIds')
    .sort({ createdAt: 1 });
  const missingCount = products.reduce((count, product) =>
    count + product.images.filter((_, index) =>
      !product.imageThumbnailUrls?.[index] || !product.imageThumbnailPublicIds?.[index]
    ).length, 0);

  console.log(`Product thumbnail backfill: ${products.length} product(s), ${missingCount} missing thumbnail(s).`);
  if (verify) {
    let verifiedCount = 0;
    for (const product of products) {
      for (const url of product.imageThumbnailUrls || []) {
        if (!url) continue;
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') {
          throw new Error(`Invalid thumbnail URL stored for ${product.slug}`);
        }
        const metadata = await sharp(await downloadImage(url)).metadata();
        if (metadata.width !== 800 || metadata.height !== 800 || metadata.format !== 'webp') {
          throw new Error(`Invalid thumbnail dimensions or format for ${product.slug}`);
        }
        verifiedCount += 1;
      }
    }
    console.log(`Verified ${verifiedCount} persisted 800x800 WebP thumbnail(s).`);
  }
  if (!apply) {
    console.log('Dry run only. Re-run with --apply to create and persist missing thumbnails.');
    return;
  }

  let createdCount = 0;
  for (const product of products) {
    const thumbnailUrls = [...(product.imageThumbnailUrls || [])];
    const thumbnailPublicIds = [...(product.imageThumbnailPublicIds || [])];
    const createdPublicIds: string[] = [];
    let changed = false;

    try {
      for (let index = 0; index < product.images.length; index += 1) {
        if (thumbnailUrls[index] && thumbnailPublicIds[index]) continue;
        const source = await downloadImage(product.images[index]);
        const thumbnailBuffer = await createProductThumbnail(source);
        const uploaded = await uploadProductThumbnail(thumbnailBuffer);
        thumbnailUrls[index] = uploaded.url;
        thumbnailPublicIds[index] = uploaded.publicId;
        createdPublicIds.push(uploaded.publicId);
        createdCount += 1;
        changed = true;
      }

      if (changed) {
        await Product.updateOne(
          { _id: product._id },
          { $set: { imageThumbnailUrls: thumbnailUrls, imageThumbnailPublicIds: thumbnailPublicIds } }
        );
        console.log(`Updated thumbnails for ${product.slug}.`);
      }
    } catch {
      if (createdPublicIds.length > 0) await deleteProductImages(createdPublicIds);
      throw new Error(`Thumbnail backfill failed for ${product.slug}`);
    }
  }

  console.log(`Product thumbnail backfill complete: ${createdCount} thumbnail(s) created.`);
};

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : 'Product thumbnail backfill failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
