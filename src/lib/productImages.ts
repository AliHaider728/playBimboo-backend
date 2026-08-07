import sharp from 'sharp';

export const PRODUCT_THUMBNAIL_SIZE = 800;

export const createProductThumbnail = (buffer: Buffer) =>
  sharp(buffer)
    .rotate()
    .resize(PRODUCT_THUMBNAIL_SIZE, PRODUCT_THUMBNAIL_SIZE, {
      fit: 'cover',
      position: 'north'
    })
    .webp({ quality: 88 })
    .toBuffer();
