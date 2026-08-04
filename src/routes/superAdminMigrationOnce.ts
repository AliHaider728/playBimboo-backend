import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Router, Request, Response } from 'express';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Settings from '../models/Settings.js';
import User from '../models/User.js';

const router = Router();
const PRIMARY_ADMIN_EMAIL = 'playbimboo@gmail.com';
const TOKEN_PURPOSE = 'playbimboo-one-time-super-admin-promotion-v1';

const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

const maskEmail = (email: string) => {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
};

const isAuthorizedSetupRequest = (req: Request) => {
  const secret = process.env.JWT_SECRET;
  const supplied = String(req.headers['x-playbimboo-setup-token'] || '');
  if (!secret || !/^[a-f0-9]{64}$/.test(supplied)) return false;
  const expected = createHmac('sha256', secret).update(TOKEN_PURPOSE).digest('hex');
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
};

router.post('/', async (req: Request, res: Response) => {
  if (!isAuthorizedSetupRequest(req)) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const user = await User.findOne({ email: PRIMARY_ADMIN_EMAIL }).select('_id email role').lean();
    if (!user || !['admin', 'super_admin'].includes(user.role)) {
      return res.status(409).json({ error: 'Configured primary administrator was not found' });
    }

    const [products, orders, settingsDocument] = await Promise.all([
      Product.find().sort({ _id: 1 }).lean(),
      Order.find().sort({ _id: 1 }).lean(),
      Settings.findOne().lean()
    ]);
    const settings = settingsDocument ? { ...settingsDocument } as Record<string, unknown> : {};
    delete settings._id;
    delete settings.__v;
    delete settings.createdAt;
    delete settings.updatedAt;

    const oldRole = user.role;
    if (oldRole !== 'super_admin') {
      const update = await User.updateOne(
        { _id: user._id, email: PRIMARY_ADMIN_EMAIL, role: oldRole },
        { $set: { role: 'super_admin' } }
      );
      if (update.modifiedCount !== 1) {
        return res.status(409).json({ error: 'Role update was not applied exactly once' });
      }
    }
    const verified = await User.findById(user._id).select('_id email role').lean();
    if (!verified || verified.role !== 'super_admin') {
      return res.status(500).json({ error: 'Role verification failed' });
    }

    res.json({
      user: {
        id: `…${String(verified._id).slice(-6)}`,
        email: maskEmail(verified.email),
        oldRole,
        newRole: verified.role
      },
      baseline: {
        products: { count: products.length, hash: hash(products) },
        orders: { count: orders.length, hash: hash(orders) },
        settings: { count: settingsDocument ? 1 : 0, hash: hash(settings) }
      }
    });
  } catch {
    res.status(500).json({ error: 'One-time migration failed' });
  }
});

export default router;
