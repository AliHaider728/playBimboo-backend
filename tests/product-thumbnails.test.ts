import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { createProductThumbnail, PRODUCT_THUMBNAIL_SIZE } from '../src/lib/productImages.js';

test('creates an 800x800 WebP product thumbnail cropped from the top', async () => {
  const source = await sharp(Buffer.from(`
    <svg width="400" height="800" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="400" fill="#ff0000" />
      <rect y="400" width="400" height="400" fill="#0000ff" />
    </svg>
  `)).png().toBuffer();

  const thumbnail = await createProductThumbnail(source);
  const metadata = await sharp(thumbnail).metadata();
  const stats = await sharp(thumbnail).stats();

  assert.equal(metadata.width, PRODUCT_THUMBNAIL_SIZE);
  assert.equal(metadata.height, PRODUCT_THUMBNAIL_SIZE);
  assert.equal(metadata.format, 'webp');
  assert.ok(stats.channels[0].mean > 240, 'top red region should be retained');
  assert.ok(stats.channels[2].mean < 15, 'bottom blue region should be cropped out');
});
