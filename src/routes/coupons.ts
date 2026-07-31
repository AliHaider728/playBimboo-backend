import { Router, Request, Response } from 'express';
import Coupon from '../models/Coupon.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = Router();

// GET all coupons (Admin)
router.get('/', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json(coupons);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST Validate Coupon Code (Public for Checkout)
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { code, cartSubtotal } = req.body;
    if (!code) return res.status(400).json({ error: 'Coupon code required' });

    const coupon = await Coupon.findOne({ code: code.trim().toUpperCase(), isActive: true });
    if (!coupon) {
      return res.status(404).json({ error: 'Invalid or expired coupon code' });
    }

    if (coupon.minPurchase && cartSubtotal < coupon.minPurchase) {
      return res.status(400).json({
        error: `Minimum order purchase of Rs. ${coupon.minPurchase} required for coupon ${code}`
      });
    }

    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
      discountAmount = Math.round((cartSubtotal * coupon.discountValue) / 100);
    } else {
      discountAmount = coupon.discountValue;
    }

    res.json({
      valid: true,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountAmount
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST Create Coupon (Admin)
router.post('/', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const newCoupon = new Coupon(req.body);
    await newCoupon.save();
    res.status(201).json(newCoupon);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE Coupon (Admin)
router.delete('/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const deleted = await Coupon.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Coupon not found' });
    res.json({ message: 'Coupon deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
