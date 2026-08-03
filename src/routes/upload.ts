import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = Router();

const hasCloudinary = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (hasCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

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
  if (!hasCloudinary) {
    return res.status(503).json({
      error:
        'Image uploads are unavailable because Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
    });
  }

  next();
};

const uploadImageBuffer = (file: Express.Multer.File) =>
  new Promise<{ url: string; publicId: string }>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'playbimboo_products',
        resource_type: 'image'
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        if (!result) {
          reject(new Error('Cloudinary returned no upload result'));
          return;
        }

        resolve({
          url: result.secure_url,
          publicId: result.public_id
        });
      }
    );

    uploadStream.end(file.buffer);
  });

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
      const result = await uploadImageBuffer(req.file);
      res.json({
        url: result.url,
        filename: result.publicId,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
    } catch (error: any) {
      console.error('Cloudinary image upload failed:', error);
      res.status(502).json({ error: 'Cloudinary image upload failed' });
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
