import { Router, Request, Response } from 'express';
import Review from '../models/Review.js';
import { authenticateToken, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { recalculateProductReviewSummary } from '../lib/productReviews.js';
import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';

const router = Router();

// GET approved reviews for a specific product (Public)
router.get('/product/:productId', async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    let searchIds = [productId];

    // If it's a valid ObjectId, we can search by _id or slug
    // We should also find the product to get both identifiers just to be safe.
    const Product = mongoose.model('Product');
    const product = await Product.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(productId) ? productId : null },
        { slug: productId }
      ]
    });
    
    if (product) {
       searchIds = [String(product._id), product.slug];
    }

    const reviews = await Review.find({
      productId: { $in: searchIds },
      status: 'approved'
    }).sort({ createdAt: -1 });

    res.json(reviews);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST submit a review for a product (Customer)
router.post('/', async (req: Request, res: Response) => {
  try {
    let { productId, productName, reviewerName, reviewerEmail, rating, title, content } = req.body;
    
    // Basic validation
    if (!productId || !rating || !content || !reviewerName) {
      return res.status(400).json({ error: 'Missing required review fields' });
    }
    
    // Enforce rating integer bounds
    rating = Math.max(1, Math.min(5, Math.floor(Number(rating))));

    // Sanitize
    content = sanitizeHtml(content, { allowedTags: [], allowedAttributes: {} });
    if (title) title = sanitizeHtml(title, { allowedTags: [], allowedAttributes: {} });
    reviewerName = sanitizeHtml(reviewerName, { allowedTags: [], allowedAttributes: {} });
    
    if (content.length < 5) {
      return res.status(400).json({ error: 'Review content is too short' });
    }

    // Duplicate / Spam Protection: Check if this email submitted a review for this product in the last 24h
    if (reviewerEmail) {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const existing = await Review.findOne({
        productId,
        reviewerEmail,
        createdAt: { $gte: oneDayAgo }
      });
      if (existing) {
        return res.status(429).json({ error: 'You have already submitted a review for this product recently.' });
      }
    }

    const newReview = new Review({
      productId,
      productName: productName || 'Toy Product',
      reviewerName,
      reviewerEmail,
      rating,
      title,
      content,
      status: 'pending',
      source: 'customer',
      verifiedPurchase: false // Can be extended to check order history if userId is provided
    });

    await newReview.save();

    // Do NOT recalculate product review summary here, because it's pending.
    res.status(201).json({ message: 'Thank you! Your review has been submitted and will appear after approval.', review: newReview });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET all reviews for Admin Moderation (Admin)
router.get('/admin', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status, source, rating, search, page = 1, limit = 50 } = req.query;
    
    const query: any = {};
    if (status) query.status = status;
    if (source) query.source = source;
    if (rating) query.rating = Number(rating);
    if (search) {
      query.$or = [
        { reviewerName: { $regex: search, $options: 'i' } },
        { productName: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    
    const [reviews, total, counts] = await Promise.all([
      Review.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Review.countDocuments(query),
      Review.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);

    // Note: Population of product data (thumbnail, slug) can be done with a lookup if they are in the same DB,
    // or we can fetch them. Here we use an aggregation lookup for the products to get thumbnail.
    // However, Mongoose populate is easier if there's a ref, but productId is a string.
    // We'll use a manual lookup if needed, but for simplicity, we return the reviews and the frontend can fetch products if needed,
    // OR we can do a quick aggregate here.
    
    // We'll fetch the associated products to append thumbnail/slug
    const Product = mongoose.model('Product');
    const productIds = [...new Set(reviews.map(r => r.productId))];
    
    // Fetch products based on slug or _id
    const objectIds = productIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    const products = await Product.find({
      $or: [
        { _id: { $in: objectIds } },
        { slug: { $in: productIds } }
      ]
    }).select('_id slug name images imagePublicIds');

    const productsMap = new Map(products.map(p => [String(p._id), p]));
    products.forEach(p => productsMap.set(p.slug, p));

    const enrichedReviews = reviews.map(r => {
      const p = productsMap.get(r.productId);
      return {
        ...r.toObject(),
        productSlug: p?.slug || '',
        productThumbnail: p?.images?.[0] || ''
      };
    });

    const countsObj = { pending: 0, approved: 0, rejected: 0 };
    counts.forEach(c => {
      if (c._id in countsObj) (countsObj as any)[c._id] = c.count;
    });

    res.json({
      reviews: enrichedReviews,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      counts: countsObj
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST Admin creates a review (Admin)
router.post('/admin', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { productId, productName, reviewerName, rating, title, content, avatarUrl, imageUrl, imagePublicId, verifiedPurchase } = req.body;
    if (!productId || !rating || !content || !reviewerName) {
      return res.status(400).json({ error: 'Missing required review fields' });
    }

    const newReview = new Review({
      productId,
      productName: productName || 'Toy Product',
      reviewerName,
      rating: Number(rating),
      title,
      content,
      avatarUrl,
      imageUrl,
      imagePublicId,
      status: 'approved',
      source: 'admin',
      verifiedPurchase: Boolean(verifiedPurchase),
      approvedAt: new Date(),
      approvedBy: req.user?.email || 'admin'
    });

    await newReview.save();
    await recalculateProductReviewSummary(productId);

    res.status(201).json(newReview);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT Approve Review (Admin)
router.put('/:id/approve', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: req.user?.email || 'admin'
      },
      { new: true }
    );
    if (!review) return res.status(404).json({ error: 'Review not found' });
    await recalculateProductReviewSummary(review.productId);
    res.json(review);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT Reject Review (Admin)
router.put('/:id/reject', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { status: 'rejected' },
      { new: true }
    );
    if (!review) return res.status(404).json({ error: 'Review not found' });
    await recalculateProductReviewSummary(review.productId);
    res.json(review);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT Edit Review (Admin)
router.put('/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { reviewerName, rating, title, content, avatarUrl, verifiedPurchase } = req.body;
    
    // Only allow updating certain fields to avoid tampering with product assignments
    const updateData: any = {};
    if (reviewerName !== undefined) updateData.reviewerName = reviewerName;
    if (rating !== undefined) updateData.rating = Number(rating);
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
    if (verifiedPurchase !== undefined) updateData.verifiedPurchase = Boolean(verifiedPurchase);

    const review = await Review.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    if (!review) return res.status(404).json({ error: 'Review not found' });
    
    if (review.status === 'approved') {
      await recalculateProductReviewSummary(review.productId);
    }
    
    res.json(review);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE Review (Admin)
router.delete('/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    
    if (review.status === 'approved') {
      await recalculateProductReviewSummary(review.productId);
    }
    
    res.json({ message: 'Review deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
