import { Router, Request, Response } from 'express';
import Review from '../models/Review.js';
import Product from '../models/Product.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = Router();

// GET approved reviews for a specific product
router.get('/product/:productId', async (req: Request, res: Response) => {
  try {
    const reviews = await Review.find({
      productId: req.params.productId,
      isApproved: true
    }).sort({ createdAt: -1 });

    res.json(reviews);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST submit a review for a product
router.post('/', async (req: Request, res: Response) => {
  try {
    const { productId, productName, authorName, authorEmail, rating, comment } = req.body;
    if (!productId || !rating || !comment || !authorName) {
      return res.status(400).json({ error: 'Missing required review fields' });
    }

    const newReview = new Review({
      productId,
      productName: productName || 'Toy Product',
      authorName,
      authorEmail,
      rating: Number(rating),
      comment,
      isApproved: true // Auto approved
    });

    await newReview.save();

    // Recalculate average product rating and reviewCount
    const reviews = await Review.find({ productId, isApproved: true });
    const avgRating = Number((reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1));

    await Product.findByIdAndUpdate(productId, {
      rating: avgRating,
      reviewCount: reviews.length
    });

    res.status(201).json(newReview);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET all reviews for Admin Moderation
router.get('/admin/all', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const reviews = await Review.find().sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT Approve Review
router.put('/:id/approve', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { isApproved: true },
      { new: true }
    );
    if (!review) return res.status(404).json({ error: 'Review not found' });
    res.json(review);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE Review
router.delete('/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    res.json({ message: 'Review deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
