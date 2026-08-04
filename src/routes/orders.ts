import { Router, Request, Response } from 'express';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Settings from '../models/Settings.js';
import {
  getEmailFailureCode,
  sendOrderConfirmationEmail,
  sendOrderDeliveredEmail,
  sendOrderStatusEmail,
  sendAdminNewOrderEmail,
  getAdminNotificationRecipients
} from '../utils/mailer.js';
import { authenticateToken, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { hasVariantGroups, normalizeInventory } from '../lib/inventory.js';

const router = Router();

const logEmailFailure = (kind: string, orderId: string, error: unknown) => {
  console.error(`${kind} email failed for order ${orderId} (${getEmailFailureCode(error)}).`);
};

const sendAndTrackOrderConfirmation = async (order: any) => {
  if (order.confirmationEmailSentAt) return;
  try {
    const confirmation = await sendOrderConfirmationEmail(order);
    order.confirmationEmailSentAt = new Date();
    order.confirmationEmailMessageId = confirmation.messageId;
    order.confirmationEmailAccepted = confirmation.acceptedCount > 0;
    order.confirmationEmailFailedAt = undefined;
    order.confirmationEmailFailureCode = undefined;
  } catch (error) {
    order.confirmationEmailAccepted = false;
    order.confirmationEmailFailedAt = new Date();
    order.confirmationEmailFailureCode = getEmailFailureCode(error);
    logEmailFailure('Order confirmation', order.orderId, error);
  }
  await order.save();
};

const sendAndTrackAdminNewOrderNotification = async (order: any) => {
  if (order.newOrderEmailSentAt) return;
  order.newOrderEmailAttemptedAt = new Date();

  const recipients = getAdminNotificationRecipients();
  if (recipients.length === 0) {
    order.newOrderEmailError = 'NEW_ORDER_RECIPIENT_NOT_CONFIGURED';
    await order.save();
    return;
  }

  order.newOrderEmailRecipients = recipients;

  try {
    const delivery = await sendAdminNewOrderEmail(order, recipients);
    order.newOrderEmailSentAt = new Date();
    order.newOrderEmailMessageId = delivery.messageId;
    order.newOrderEmailError = undefined;
  } catch (error) {
    order.newOrderEmailError = getEmailFailureCode(error);
    logEmailFailure('Admin new order', order.orderId, error);
  }
  await order.save();
};

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

export const validateItemStock = (product: any, quantity: number, selectedVariant?: string) => {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Order item quantity must be a positive integer');
  const groups = Array.isArray(product.variants)
    ? product.variants.filter((group: any) => Array.isArray(group.options) && group.options.length > 0)
    : [];
  if (groups.length === 0) {
    const inventory = normalizeInventory(product);
    if (!inventory.inStock || (inventory.trackInventory && (inventory.stockQuantity || 0) < quantity)) {
      throw new Error(`${product.name} does not have enough stock`);
    }
    return;
  }

  const selections = parseVariantSelection(selectedVariant);
  for (const group of groups) {
    const selectedName = selections.get(group.name);
    const option = group.options.find((candidate: any) => candidate.name === selectedName);
    if (!option) throw new Error(`Select a valid ${group.name} option for ${product.name}`);
    const inventory = normalizeInventory(option);
    if (!inventory.inStock || (inventory.trackInventory && (inventory.stockQuantity || 0) < quantity)) {
      throw new Error(`${product.name} – ${option.name} does not have enough stock`);
    }
  }
};

const adjustProductStock = async (productId: string, quantityDelta: number, selectedVariant?: string) => {
  const product: any = await Product.findById(productId);
  if (!product) return false;
  let adjusted = false;

  if (hasVariantGroups(product)) {
    const selections = parseVariantSelection(selectedVariant);
    for (const group of product.variants || []) {
      const selectedName = selections.get(group.name);
      const option = group.options?.find((candidate: any) => candidate.name === selectedName);
      if (option) {
        const inventory = normalizeInventory(option);
        if (inventory.trackInventory) {
          option.trackInventory = true;
          option.stockQuantity = Math.max(0, (inventory.stockQuantity || 0) + quantityDelta);
          option.stockStatus = option.stockQuantity > 0 ? 'in_stock' : 'out_of_stock';
          option.inStock = option.stockQuantity > 0;
          adjusted = true;
        }
      }
    }
  } else {
    const inventory = normalizeInventory(product);
    if (inventory.trackInventory) {
      product.trackInventory = true;
      product.stockQuantity = Math.max(0, (inventory.stockQuantity || 0) + quantityDelta);
      product.stockStatus = product.stockQuantity > 0 ? 'in_stock' : 'out_of_stock';
      product.inStock = product.stockQuantity > 0;
      adjusted = true;
    }
  }
  await product.save();
  return adjusted;
};

// GET all orders (with optional email filter for customer history)
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.query;
    const filter: any = {};

    if (['admin', 'super_admin'].includes(req.user?.role || '')) {
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
      ['admin', 'super_admin'].includes(req.user?.role || '') ||
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
  const checkoutRequestId = typeof req.body?.checkoutRequestId === 'string'
    ? req.body.checkoutRequestId.trim()
    : '';
  try {
    const { customerName, email, phone, items, discountAmount, shippingAddress, appliedCoupon } = req.body;

    if (checkoutRequestId && !/^[a-zA-Z0-9_-]{16,120}$/.test(checkoutRequestId)) {
      return res.status(400).json({ error: 'Invalid checkout request identifier' });
    }
    if (checkoutRequestId) {
      const existingOrder = await Order.findOne({ checkoutRequestId });
      if (existingOrder) return res.status(200).json(existingOrder);
    }

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
      if (!hasVariantGroups(product)) {
        const productInventory = normalizeInventory(product);
        if (productInventory.trackInventory) {
          const requestedProductQuantity =
            (requestedProductQuantities.get(productKey) || 0) + Number(item.quantity);
          if (requestedProductQuantity > (productInventory.stockQuantity || 0)) {
            return res.status(400).json({ error: `${product.name} does not have enough stock` });
          }
          requestedProductQuantities.set(productKey, requestedProductQuantity);
        }
      }
      verifiedProducts.set(String(product.id), product);
      const selections = parseVariantSelection(item.selectedVariant);
      for (const group of product.variants || []) {
        const selectedName = selections.get(group.name);
        const option = group.options?.find((candidate: any) => candidate.name === selectedName);
        const optionInventory = option ? normalizeInventory(option) : undefined;
        if (option && optionInventory?.trackInventory) {
          const variantKey = `${productKey}:${group.name}:${option.name}`;
          const requestedVariantQuantity =
            (requestedVariantQuantities.get(variantKey) || 0) + Number(item.quantity);
          if (requestedVariantQuantity > (optionInventory.stockQuantity || 0)) {
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
        const category = product.categoryId
          ? await Category.findById(product.categoryId)
          : await Category.findOne({ slug: product.categorySlug });
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

    const orderId = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
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
      checkoutRequestId: checkoutRequestId || undefined,
      date: dateStr
    });

    await newOrder.save();

    // Deduct stock for ordered products
    for (const item of items) {
      if (item.productId) {
        await adjustProductStock(item.productId, -item.quantity, item.selectedVariant);
      }
    }

    // The order remains valid if SMTP fails; only a sanitized failure state is persisted.
    await sendAndTrackOrderConfirmation(newOrder);
    await sendAndTrackAdminNewOrderNotification(newOrder);

    res.status(201).json(newOrder);
  } catch (err: any) {
    if (checkoutRequestId && err?.code === 11000) {
      const existingOrder = await Order.findOne({ checkoutRequestId });
      if (existingOrder) return res.status(200).json(existingOrder);
    }
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

    void sendOrderStatusEmail(order).catch(error =>
      logEmailFailure('Order status', order.orderId, error)
    );

    res.json({ message: 'Order successfully cancelled within 24h window', order });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT Update Order Status (Admin)
router.put('/:orderId/status', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid order status' });
    }

    const previousOrder = await Order.findOneAndUpdate(
      { orderId: req.params.orderId },
      { status },
      { new: false, runValidators: true }
    );

    if (!previousOrder) return res.status(404).json({ error: 'Order not found' });
    const order = await Order.findById(previousOrder.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const statusChanged = previousOrder.status !== status;
    const transitionedToDelivered = statusChanged && status === 'Delivered';
    const notification = {
      emailStatus: 'not_applicable' as 'not_applicable' | 'sent' | 'failed' | 'already_sent',
      inventoryRestored: false,
      alreadyDelivered: !statusChanged && status === 'Delivered'
    };

    if (statusChanged && status === 'Cancelled') {
      for (const item of order.items) {
        if (item.productId) {
          notification.inventoryRestored = (await adjustProductStock(item.productId, item.quantity, item.selectedVariant)) || notification.inventoryRestored;
        }
      }
    } else if (statusChanged && previousOrder.status === 'Cancelled') {
      try {
        for (const item of order.items) {
          if (!item.productId) continue;
          const product = await Product.findById(item.productId);
          if (product) validateItemStock(product, item.quantity, item.selectedVariant);
        }
      } catch (error) {
        order.status = previousOrder.status;
        await order.save();
        throw error;
      }
      for (const item of order.items) {
        if (item.productId) await adjustProductStock(item.productId, -item.quantity, item.selectedVariant);
      }
    }

    if (transitionedToDelivered) {
      order.deliveredAt = new Date();
      await order.save();

      if (!order.deliveredEmailSentAt) {
        try {
          const delivery = await sendOrderDeliveredEmail(order);
          order.deliveredEmailSentAt = new Date();
          order.deliveredEmailMessageId = delivery.messageId;
          order.deliveredEmailAccepted = delivery.acceptedCount > 0;
          order.deliveredEmailFailedAt = undefined;
          order.deliveredEmailFailureCode = undefined;
          notification.emailStatus = 'sent';
        } catch (error) {
          const failureCode = getEmailFailureCode(error);
          order.deliveredEmailAccepted = false;
          order.deliveredEmailFailedAt = new Date();
          order.deliveredEmailFailureCode = failureCode;
          logEmailFailure('Delivered order', order.orderId, error);
          notification.emailStatus = 'failed';
        }
        await order.save();
      } else {
        notification.emailStatus = 'already_sent';
      }
    } else if (statusChanged) {
      void sendOrderStatusEmail(order).catch(error =>
        logEmailFailure('Order status', order.orderId, error)
      );
    }

    if (notification.alreadyDelivered && order.deliveredEmailSentAt) notification.emailStatus = 'already_sent';
    res.json({ order, notification });
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
