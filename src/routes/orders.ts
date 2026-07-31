import { Router, Request, Response } from 'express';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { sendOrderConfirmationEmail, sendOrderStatusEmail } from '../utils/mailer.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = Router();

// GET all orders (with optional email filter for customer history)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { email } = req.query;
    const filter: any = {};
    if (email) filter.email = email;

    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET single order by ID
router.get('/:orderId', async (req: Request, res: Response) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST Place New COD Order
router.post('/', async (req: Request, res: Response) => {
  try {
    const { customerName, email, phone, items, subtotal, deliveryCharge, discountAmount, total, shippingAddress, appliedCoupon } = req.body;

    const orderId = `ORD-${Math.floor(10000 + Math.random() * 90000)}`;
    const dateStr = new Date().toISOString().split('T')[0];

    const newOrder = new Order({
      orderId,
      customerName,
      email,
      phone,
      items,
      subtotal,
      deliveryCharge,
      discountAmount,
      total,
      status: 'Pending',
      paymentMethod: 'Cash on Delivery (COD)',
      shippingAddress,
      appliedCoupon,
      date: dateStr
    });

    await newOrder.save();

    // Deduct stock for ordered products
    for (const item of items) {
      if (item.productId) {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { stockQuantity: -item.quantity }
        });
      }
    }

    // Send confirmation email asynchronously via Nodemailer
    sendOrderConfirmationEmail(newOrder).catch(console.error);

    res.status(201).json(newOrder);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST Cancel Order within 24 hours
router.post('/:orderId/cancel', async (req: Request, res: Response) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Check 24 hour limit
    const orderTime = new Date(order.createdAt).getTime();
    const currentTime = new Date().getTime();
    const hoursElapsed = (currentTime - orderTime) / (1000 * 60 * 60);

    if (hoursElapsed > 24) {
      return res.status(400).json({ error: 'Order cancellation window (24 hours) has expired. Please contact support.' });
    }

    if (order.status === 'Cancelled') {
      return res.status(400).json({ error: 'Order is already cancelled' });
    }

    order.status = 'Cancelled';
    await order.save();

    // Restock items
    for (const item of order.items) {
      if (item.productId) {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { stockQuantity: item.quantity }
        });
      }
    }

    sendOrderStatusEmail(order).catch(console.error);

    res.json({ message: 'Order successfully cancelled within 24h window', order });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT Update Order Status (Admin)
router.put('/:orderId/status', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const order = await Order.findOneAndUpdate(
      { orderId: req.params.orderId },
      { status },
      { new: true }
    );

    if (!order) return res.status(404).json({ error: 'Order not found' });

    sendOrderStatusEmail(order).catch(console.error);

    res.json(order);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT Update Courier Tracking Code (Admin)
router.put('/:orderId/tracking', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { trackingNumber } = req.body;
    const order = await Order.findOneAndUpdate(
      { orderId: req.params.orderId },
      { trackingNumber },
      { new: true }
    );

    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
