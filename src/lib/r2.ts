import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const endpoint = process.env.R2_ENDPOINT;

// 1. Set up an R2 client using the S3-compatible SDK
export const r2Client = new S3Client({
  region: 'auto',
  endpoint: endpoint || `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: accessKeyId || '',
    secretAccessKey: secretAccessKey || '',
  },
});

/**
 * 2. Reusable upload utility function
 * Uploads a file buffer to the configured R2 bucket and returns the public URL.
 */
export const uploadToR2 = async (
  fileBuffer: Buffer,
  fileName: string,
  contentType: string
): Promise<string> => {
  const bucketName = process.env.R2_BUCKET_NAME || 'alvora-assets';
  const publicUrlBase = process.env.R2_PUBLIC_URL || '';

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: fileName,
    Body: fileBuffer,
    ContentType: contentType,
  });

  await r2Client.send(command);

  // Returns the final public URL
  return `${publicUrlBase}/${fileName}`;
};

/**
 * Delete a file from the configured R2 bucket.
 */
export const deleteFromR2 = async (fileName: string): Promise<void> => {
  const bucketName = process.env.R2_BUCKET_NAME || 'alvora-assets';

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: fileName,
  });

  await r2Client.send(command);
};
