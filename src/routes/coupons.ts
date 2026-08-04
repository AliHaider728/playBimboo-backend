import { Router, Request, Response } from 'express';
import Coupon from '../models/Coupon.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = Router();

const normalizeCouponPayload = (body: Record<string, any>, current: Record<string, any> = {}) => {
  const merged = { ...current, ...body };
  const code = String(merged.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
  const discountType = merged.discountType === 'flat' ? 'fixed' : merged.discountType;
  const discountValue = Number(merged.discountValue ?? merged.amount);
  const minPurchase = Number(merged.minPurchase ?? merged.minSpend ?? 0);
  const usageLimit = merged.usageLimit === undefined || merged.usageLimit === '' ? undefined : Number(merged.usageLimit);
  if (!code) throw new Error('Coupon code is required');
  if (!['percentage', 'fixed'].includes(discountType)) throw new Error('Choose a valid discount type');
  if (!Number.isFinite(discountValue) || discountValue <= 0) throw new Error('Discount value must be greater than zero');
  if (discountType === 'percentage' && discountValue > 100) throw new Error('Percentage discount cannot exceed 100');
  if (!Number.isFinite(minPurchase) || minPurchase < 0) throw new Error('Minimum purchase cannot be negative');
  if (usageLimit !== undefined && (!Number.isInteger(usageLimit) || usageLimit < 1)) throw new Error('Usage limit must be a positive whole number');
  return { code, discountType, discountValue, minPurchase, usageLimit, expiryDate: String(merged.expiryDate || '').slice(0, 10) || undefined, isActive: merged.isActive !== false };
};

// GET all coupons (Admin)
router.get('/', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json(coupons);
  } catch { res.status(500).json({ error: 'Could not load coupons' }); }
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
  } catch { res.status(500).json({ error: 'Could not validate coupon' }); }
});

// POST Create Coupon (Admin)
router.post('/', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const newCoupon = new Coupon(normalizeCouponPayload(req.body));
    await newCoupon.save();
    res.status(201).json(newCoupon);
  } catch (error: any) { res.status(error?.code === 11000 ? 409 : 400).json({ error: error?.code === 11000 ? 'Coupon code is already in use' : error instanceof Error ? error.message : 'Could not create coupon' }); }
});

router.put('/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
    coupon.set(normalizeCouponPayload(req.body, coupon.toObject()));
    await coupon.save();
    res.json(coupon);
  } catch (error: any) { res.status(error?.code === 11000 ? 409 : 400).json({ error: error?.code === 11000 ? 'Coupon code is already in use' : error instanceof Error ? error.message : 'Could not update coupon' }); }
});

// DELETE Coupon (Admin)
router.delete('/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const deleted = await Coupon.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Coupon not found' });
    res.json({ message: 'Coupon deleted' });
  } catch { res.status(500).json({ error: 'Could not delete coupon' }); }
});

export default router;
