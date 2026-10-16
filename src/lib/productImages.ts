export const PRODUCT_THUMBNAIL_SIZE = 800;

// Native image dependencies must not prevent the API from booting.
// A broken installation fails the upload request and is logged by its route.
export const createProductThumbnail = async (buffer: Buffer) => {
  const { default: sharp } = await import('sharp');
  return sharp(buffer)
    .rotate()
    .resize(PRODUCT_THUMBNAIL_SIZE, PRODUCT_THUMBNAIL_SIZE, {
      fit: 'cover',
      position: 'north'
    })
    .webp({ quality: 88 })
    .toBuffer();
};
