import { Router, Request, Response } from 'express';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Settings from '../models/Settings.js';
import { sendOrderConfirmationEmail, sendOrderStatusEmail } from '../utils/mailer.js';
import { authenticateToken, requireAdmin, AuthRequest } from '../middleware/auth.js';

const router = Router();

const parseVariantSelection = (selection?: string) =>
  new Map(
    String(selection || '')
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const separator = part.indexOf(':');
        return separator === -1
          ? ['', part]
          : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
      })
  );

const validateItemStock = (product: any, quantity: number, selectedVariant?: string) => {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Order item quantity must be a positive integer');
  if (!product.inStock || product.stockQuantity < quantity) {
    throw new Error(`${product.name} does not have enough stock`);
  }

  const groups = Array.isArray(product.variants)
    ? product.variants.filter((group: any) => Array.isArray(group.options) && group.options.length > 0)
    : [];
  if (groups.length === 0) return;

  const selections = parseVariantSelection(selectedVariant);
  for (const group of groups) {
    const selectedName = selections.get(group.name);
    const option = group.options.find((candidate: any) => candidate.name === selectedName);
    if (!option) throw new Error(`Select a valid ${group.name} option for ${product.name}`);
    if (option.inStock === false || (option.stockQuantity !== undefined && option.stockQuantity < quantity)) {
      throw new Error(`${product.name} – ${option.name} does not have enough stock`);
    }
  }
};

const adjustProductStock = async (productId: string, quantityDelta: number, selectedVariant?: string) => {
  const product: any = await Product.findById(productId);
  if (!product) return;

  product.stockQuantity = Math.max(0, product.stockQuantity + quantityDelta);
  product.inStock = product.stockQuantity > 0;
  const selections = parseVariantSelection(selectedVariant);
  for (const group of product.variants || []) {
    const selectedName = selections.get(group.name);
    const option = group.options?.find((candidate: any) => candidate.name === selectedName);
    if (option && option.stockQuantity !== undefined) {
      option.stockQuantity = Math.max(0, option.stockQuantity + quantityDelta);
      option.inStock = option.stockQuantity > 0;
    }
  }
  await product.save();
};

// GET all orders (with optional email filter for customer history)
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.query;
    const filter: any = {};

    if (req.user?.role === 'admin') {
      if (typeof email === 'string' && email.trim()) {
        filter.email = email.trim().toLowerCase();
      }
    } else {
      filter.email = req.user?.email.toLowerCase();
    }

    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET single order by ID
router.get('/:orderId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const canViewOrder =
      req.user?.role === 'admin' ||
      order.email.toLowerCase() === req.user?.email.toLowerCase();
    if (!canViewOrder) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(order);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST Place New COD Order
router.post('/', async (req: Request, res: Response) => {
  try {
    const { customerName, email, phone, items, discountAmount, shippingAddress, appliedCoupon } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one product' });
    }
    const verifiedProducts = new Map<string, any>();
    const requestedProductQuantities = new Map<string, number>();
    const requestedVariantQuantities = new Map<string, number>();
    const canonicalItems = [];
    let computedSubtotal = 0;
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || product.isVisible === false || product.status === 'draft') {
        return res.status(400).json({ error: 'One or more products are unavailable' });
      }
      validateItemStock(product, Number(item.quantity), item.selectedVariant);
      const productKey = String(product.id);
      const requestedProductQuantity =
        (requestedProductQuantities.get(productKey) || 0) + Number(item.quantity);
      if (requestedProductQuantity > product.stockQuantity) {
        return res.status(400).json({ error: `${product.name} does not have enough stock` });
      }
      requestedProductQuantities.set(productKey, requestedProductQuantity);
      verifiedProducts.set(String(product.id), product);
      const selections = parseVariantSelection(item.selectedVariant);
      for (const group of product.variants || []) {
        const selectedName = selections.get(group.name);
        const option = group.options?.find((candidate: any) => candidate.name === selectedName);
        if (option?.stockQuantity !== undefined) {
          const variantKey = `${productKey}:${group.name}:${option.name}`;
          const requestedVariantQuantity =
            (requestedVariantQuantities.get(variantKey) || 0) + Number(item.quantity);
          if (requestedVariantQuantity > option.stockQuantity) {
            return res.status(400).json({
              error: `${product.name} – ${option.name} does not have enough stock`
            });
          }
          requestedVariantQuantities.set(variantKey, requestedVariantQuantity);
        }
      }
      const variantOffset = (product.variants || []).reduce((sum: number, group: any) => {
        const option = group.options?.find((candidate: any) => candidate.name === selections.get(group.name));
        return sum + Number(option?.priceOffset || 0);
      }, 0);
      const unitPrice = product.price + variantOffset;
      computedSubtotal += unitPrice * Number(item.quantity);
      canonicalItems.push({
        productId: String(product.id),
        name: product.name,
        price: unitPrice,
        quantity: Number(item.quantity),
        image: product.images?.[0] || '',
        selectedVariant: item.selectedVariant
      });
    }

    const settings = (await Settings.findOne()) || new Settings({});
    let highestOverrideFee = 0;
    let hasDefaultShippingItem = false;
    let deliveryUnavailable = false;
    for (const product of verifiedProducts.values()) {
      const deliveryType = product.deliveryType || 'store_threshold';
      if (deliveryType === 'none') {
        deliveryUnavailable = true;
      } else if (deliveryType === 'fixed') {
        highestOverrideFee = Math.max(highestOverrideFee, Number(product.customDeliveryFee || 0));
      } else if (deliveryType === 'category') {
        const category = await Category.findOne({ slug: product.categorySlug });
        if (category?.deliveryCharge !== undefined) {
          highestOverrideFee = Math.max(highestOverrideFee, Number(category.deliveryCharge));
        } else {
          hasDefaultShippingItem = true;
        }
      } else if (deliveryType !== 'free') {
        hasDefaultShippingItem = true;
      }
    }
    if (deliveryUnavailable) {
      return res.status(400).json({ error: 'One or more products are not available for delivery' });
    }

    const defaultShippingFee =
      hasDefaultShippingItem && computedSubtotal < settings.freeShippingThreshold
        ? settings.standardShippingFee
        : 0;
    const computedDeliveryCharge = Math.max(highestOverrideFee, defaultShippingFee);
    const safeDiscount = Math.min(Math.max(Number(discountAmount) || 0, 0), computedSubtotal);
    const taxAmount = Math.round(computedSubtotal * (Number(settings.taxRate) || 0));
    const computedTotal = Math.max(
      0,
      computedSubtotal - safeDiscount + computedDeliveryCharge + taxAmount
    );

    const orderId = `ORD-${Math.floor(10000 + Math.random() * 90000)}`;
    const dateStr = new Date().toISOString().split('T')[0];

    const newOrder = new Order({
      orderId,
      customerName,
      email,
      phone,
      items: canonicalItems,
      subtotal: computedSubtotal,
      deliveryCharge: computedDeliveryCharge,
      discountAmount: safeDiscount,
      total: computedTotal,
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
        await adjustProductStock(item.productId, -item.quantity, item.selectedVariant);
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
        await adjustProductStock(item.productId, item.quantity, item.selectedVariant);
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
