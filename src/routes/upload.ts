import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticateToken, requireAdmin, requireSuperAdmin } from '../middleware/auth.js';
import {
  deleteCategoryImage,
  deleteProductImage,
  hasCloudinaryConfiguration,
  uploadProductDetailImage,
  uploadProductImage,
  uploadProductThumbnail,
  uploadCategoryImage,
  uploadReviewImage
} from '../lib/cloudinary.js';
import { createProductThumbnail } from '../lib/productImages.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import { connectToDatabase } from '../lib/database.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req, file, cb) => {
    const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (acceptedTypes.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPG, PNG, WEBP) are allowed'));
    }
  }
});

const requireCloudinaryConfiguration = (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!hasCloudinaryConfiguration) {
    return res.status(503).json({
      error:
        'Image uploads are unavailable because Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
    });
  }

  next();
};

// POST Upload Single Image
router.post(
  '/image',
  authenticateToken,
  requireAdmin,
  requireCloudinaryConfiguration,
  upload.single('image'),
  async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    try {
      const thumbnailBuffer = await createProductThumbnail(req.file.buffer);
      const result = await uploadProductImage(req.file);
      let thumbnail: Awaited<ReturnType<typeof uploadProductThumbnail>>;
      try {
        thumbnail = await uploadProductThumbnail(thumbnailBuffer);
      } catch {
        await deleteProductImage(result.publicId).catch(() => undefined);
        throw new Error('Product thumbnail upload failed');
      }
      res.json({
        url: result.url,
        secureUrl: result.url,
        publicId: result.publicId,
        thumbnailUrl: thumbnail.url,
        thumbnailSecureUrl: thumbnail.url,
        thumbnailPublicId: thumbnail.publicId,
        filename: result.publicId,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
    } catch {
      console.error('Cloudinary image upload failed.');
      res.status(502).json({ error: 'Cloudinary image upload failed' });
    }
  }
);

router.post(
  '/category-image',
  authenticateToken,
  requireSuperAdmin,
  requireCloudinaryConfiguration,
  upload.single('image'),
  async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: 'No image file uploaded' });
    try {
      const result = await uploadCategoryImage(req.file);
      res.json({ secureUrl: result.url, url: result.url, publicId: result.publicId });
    } catch {
      console.error('Cloudinary category image upload failed.');
      res.status(502).json({ error: 'Cloudinary category image upload failed' });
    }
  }
);

router.post(
  '/review-image',
  authenticateToken,
  requireAdmin,
  requireCloudinaryConfiguration,
  upload.single('image'),
  async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: 'No image file uploaded' });
    try {
      const result = await uploadReviewImage(req.file);
      res.json({ secureUrl: result.url, url: result.url, publicId: result.publicId });
    } catch {
      console.error('Cloudinary review image upload failed.');
      res.status(502).json({ error: 'Cloudinary review image upload failed' });
    }
  }
);

router.delete(
  '/category-image',
  authenticateToken,
  requireSuperAdmin,
  requireCloudinaryConfiguration,
  async (req: Request, res: Response) => {
    const publicId = typeof req.body?.publicId === 'string' ? req.body.publicId.trim() : '';
    if (!publicId) return res.status(400).json({ error: 'Cloudinary public ID is required' });
    try {
      await connectToDatabase();
      if (await Category.exists({ imagePublicId: publicId })) {
        return res.status(409).json({ error: 'This image is attached to a saved category.' });
      }
      const result = await deleteCategoryImage(publicId);
      if (!['ok', 'not found'].includes(result.result)) {
        return res.status(502).json({ error: 'Cloudinary did not confirm image deletion' });
      }
      res.json({ deleted: true });
    } catch (error) {
      console.error('Cloudinary category image deletion failed.');
      const message = error instanceof Error && error.message.startsWith('Invalid PlayBimboo')
        ? error.message
        : 'Cloudinary category image deletion failed';
      res.status(message.startsWith('Invalid') ? 400 : 502).json({ error: message });
    }
  }
);

// POST a product-detail content image into its dedicated Cloudinary folder
router.post(
  '/detail-content-image',
  authenticateToken,
  requireAdmin,
  requireCloudinaryConfiguration,
  upload.single('image'),
  async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    try {
      const result = await uploadProductDetailImage(req.file);
      res.json({
        url: result.url,
        secureUrl: result.url,
        publicId: result.publicId,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
    } catch {
      console.error('Cloudinary product-detail image upload failed.');
      res.status(502).json({ error: 'Cloudinary image upload failed' });
    }
  }
);

// DELETE a newly uploaded image that was discarded before the product was saved
router.delete(
  '/image',
  authenticateToken,
  requireAdmin,
  requireCloudinaryConfiguration,
  async (req: Request, res: Response) => {
    const publicId = typeof req.body?.publicId === 'string' ? req.body.publicId.trim() : '';
    if (!publicId) return res.status(400).json({ error: 'Cloudinary public ID is required' });

    try {
      await connectToDatabase();
      const referencedProduct = await Product.exists({
        $or: [
          { imagePublicIds: publicId },
          { imageThumbnailPublicIds: publicId },
          { 'productDetailBlocks.image.publicId': publicId }
        ]
      });
      if (referencedProduct) {
        return res.status(409).json({
          error: 'This image is attached to a saved product and must be removed through the product editor.'
        });
      }
      const result = await deleteProductImage(publicId);
      if (!['ok', 'not found'].includes(result.result)) {
        return res.status(502).json({ error: 'Cloudinary did not confirm image deletion' });
      }
      res.json({ deleted: true });
    } catch (error) {
      console.error('Cloudinary image deletion failed.');
      const message = error instanceof Error && error.message.startsWith('Invalid PlayBimboo')
        ? error.message
        : 'Cloudinary image deletion failed';
      res.status(message.startsWith('Invalid') ? 400 : 502).json({ error: message });
    }
  }
);

router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      error: error.code === 'LIMIT_FILE_SIZE' ? 'Image exceeds the 5MB size limit' : error.message
    });
  }
  if (error instanceof Error && error.message.startsWith('Only image files')) {
    return res.status(400).json({ error: error.message });
  }
  next(error);
});

export default router;
