import { randomUUID } from 'node:crypto';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

export const PRODUCT_IMAGE_FOLDER = 'playbimboo/products';

export const hasCloudinaryConfiguration = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (hasCloudinaryConfiguration) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
}

export const isProductImagePublicId = (publicId: string) =>
  publicId.startsWith(`${PRODUCT_IMAGE_FOLDER}/`) &&
  publicId.length > PRODUCT_IMAGE_FOLDER.length + 1;

export const uploadProductImage = (file: Express.Multer.File) =>
  new Promise<{ url: string; publicId: string }>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        asset_folder: PRODUCT_IMAGE_FOLDER,
        public_id: `${PRODUCT_IMAGE_FOLDER}/${randomUUID()}`,
        unique_filename: false,
        overwrite: false,
        resource_type: 'image'
      },
      (error, result?: UploadApiResponse) => {
        if (error) {
          reject(error);
          return;
        }

        if (!result?.secure_url || !result.public_id) {
          reject(new Error('Cloudinary returned an incomplete upload result'));
          return;
        }

        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );

    uploadStream.end(file.buffer);
  });

export const deleteProductImage = async (publicId: string) => {
  if (!isProductImagePublicId(publicId)) {
    throw new Error('Invalid PlayBimboo product image public ID');
  }

  return cloudinary.uploader.destroy(publicId, {
    resource_type: 'image',
    invalidate: true
  });
};

export const deleteProductImages = async (publicIds: string[]) => {
  const uniquePublicIds = [...new Set(publicIds.filter(isProductImagePublicId))];
  const results = await Promise.allSettled(uniquePublicIds.map(deleteProductImage));
  const failedPublicIds = results.flatMap((result, index) =>
    result.status === 'rejected' ? [uniquePublicIds[index]] : []
  );

  if (failedPublicIds.length > 0) {
    console.error(`Cloudinary cleanup failed for ${failedPublicIds.length} product image(s).`);
  }

  return failedPublicIds;
};
