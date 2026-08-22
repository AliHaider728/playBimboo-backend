import { Router, Request, Response } from 'express';
import { pool } from '../mysql-lib/db.js';
import { authenticateToken, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { sendMetaPurchase } from '../lib/metaConversionsApi.js';
import { sendTikTokPurchase } from '../lib/tiktokEventsApi.js';
import {
  getEmailFailureCode,
  sendOrderConfirmationEmail,
  sendOrderDeliveredEmail,
  sendOrderStatusEmail,
  sendAdminNewOrderEmail,
  getAdminNotificationRecipients
} from '../utils/mailer.js';
import crypto from 'crypto';

const router = Router();

const logEmailFailure = (kind: string, orderId: string, error: unknown) => {
  console.error(`${kind} email failed for order ${orderId} (${getEmailFailureCode(error)}).`);
};

// Helper: Assemble a full order object (order + items + status history)
async function getFullOrder(conn: any, orderId: string) {
  const [orderRows] = await conn.execute('SELECT * FROM orders WHERE orderId = ?', [orderId]);
  if ((orderRows as any[]).length === 0) return null;

  const order = (orderRows as any[])[0];
  const [items] = await conn.execute('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
  const [history] = await conn.execute('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY timestamp ASC', [order.id]);

  order.items = items;
  order.statusHistory = history;
  order.shippingAddress = typeof order.shippingAddress === 'string' ? JSON.parse(order.shippingAddress) : order.shippingAddress;
  return order;
}

// Generate a readable order ID (same pattern as original Mongo version)
function generateOrderId() {
  return 'PB-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}


// Map MySQL order structure to match the old MongoDB schema expected by the frontend
function mapOrderForFrontend(o: any) {
  const shipAddr = typeof o.shippingAddress === 'string' ? JSON.parse(o.shippingAddress) : (o.shippingAddress || {});
  
  let dateStr = o.date;
  if (!dateStr && o.createdAt) {
    const d = new Date(o.createdAt);
    if (!isNaN(d.getTime())) {
      dateStr = d.toISOString().split('T')[0];
    }
  }

  const mappedItems = (o.items || []).map((item: any) => ({
    ...item,
    name: item.productName || item.name,
    price: Number(item.price || 0),
    quantity: Number(item.quantity || 1)
  }));

  return {
    ...o,
    shippingAddress: shipAddr,
    customerName: o.customerName || shipAddr.fullName || shipAddr.name || o.guestEmail || 'Customer',
    email: o.guestEmail || o.email,
    phone: o.guestPhone || o.phone || shipAddr.phone,
    date: dateStr,
    total: Number(o.total || 0),
    subtotal: Number(o.subtotal || 0),
    shippingFee: Number(o.shippingFee || 0),
    deliveryCharge: Number(o.shippingFee || 0),
    discountAmount: Number(o.discountAmount || 0),
    items: mappedItems
  };
}

// GET all orders (admin sees all, customers see only their own)
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { email, page, limit, search, status } = req.query;
    const isAdmin = ['admin', 'super_admin'].includes(req.user?.role || '');
    
    let sql = 'SELECT * FROM orders';
    let countSql = 'SELECT COUNT(*) as count FROM orders';
    const params: any[] = [];
    const conditions: string[] = [];

    if (isAdmin) {
      if (typeof email === 'string' && email.trim()) {
        conditions.push('guestEmail = ?');
        params.push(email.trim().toLowerCase());
      }
      if (typeof status === 'string' && status !== 'all' && status.trim()) {
        conditions.push('status = ?');
        params.push(status.trim());
      }
      if (typeof search === 'string' && search.trim()) {
        conditions.push('(orderId LIKE ? OR guestEmail LIKE ? OR customerName LIKE ?)');
        const searchStr = `%${search.trim()}%`;
        params.push(searchStr, searchStr, searchStr);
      }
    } else {
      conditions.push('user_id = ?');
      params.push(req.user?.userId);
    }

    if (conditions.length > 0) {
      const whereClause = ' WHERE ' + conditions.join(' AND ');
      sql += whereClause;
      countSql += whereClause;
    }

    sql += ' ORDER BY createdAt DESC';

    const isPaginated = isAdmin && (page || limit || search || status);
    
    let pageNum = 1;
    let limitNum = 50;
    let totalCount = 0;
    
    if (isPaginated) {
      pageNum = Math.max(1, parseInt(page as string) || 1);
      limitNum = Math.max(1, parseInt(limit as string) || 25);
      const offset = (pageNum - 1) * limitNum;
      
      const [countRows] = await pool.execute(countSql, params);
      totalCount = (countRows as any)[0].count;
      
      sql += ` LIMIT ${limitNum} OFFSET ${offset}`;
    }

    const [orders] = await pool.execute(sql, params);

    // Attach items to each order
    let ordersArr = orders as any[];
    if (ordersArr.length > 0) {
      const orderIds = ordersArr.map(o => o.id);
      const placeholders = orderIds.map(() => '?').join(',');
      const [allItems] = await pool.execute(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`, orderIds);
      const itemsMap = new Map<string, any[]>();
      (allItems as any[]).forEach(item => {
        if (!itemsMap.has(item.order_id)) itemsMap.set(item.order_id, []);
        itemsMap.get(item.order_id)!.push(item);
      });
      ordersArr = ordersArr.map(o => {
        o.items = itemsMap.get(o.id) || [];
        o.shippingAddress = typeof o.shippingAddress === 'string' ? JSON.parse(o.shippingAddress) : o.shippingAddress;
        return o;
      });
    }

    if (isPaginated) {
      res.json({
        orders: ordersArr,
        totalCount,
        page: pageNum,
        totalPages: Math.ceil(totalCount / limitNum)
      });
    } else {
      res.json(ordersArr);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET single order by orderId
router.get('/:orderId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const order = await getFullOrder(pool, req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const isAdmin = ['admin', 'super_admin'].includes(req.user?.role || '');
    const isOwner = order.guestEmail && order.guestEmail.toLowerCase() === req.user?.email?.toLowerCase();
    const isUserOwner = order.user_id === req.user?.userId;

    if (!isAdmin && !isOwner && !isUserOwner) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(mapOrderForFrontend(order));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST Place New Order — with atomic stock deduction using MySQL TRANSACTION + SELECT FOR UPDATE
router.post('/', async (req: Request, res: Response) => {
  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    const { customerName, email, phone, items, discountAmount = 0, shippingAddress, appliedCoupon, checkoutRequestId, shippingFee: clientShippingFee } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'Order must contain at least one product' });
    }
    if (!customerName || !phone) {
      await conn.rollback();
      return res.status(400).json({ error: 'Customer name and phone are required' });
    }

    // Idempotency: check if this request was already processed
    if (checkoutRequestId && /^[a-zA-Z0-9_-]{16,120}$/.test(checkoutRequestId)) {
      const [existing] = await conn.execute('SELECT orderId FROM orders WHERE checkoutRequestId = ?', [checkoutRequestId]);
      if ((existing as any[]).length > 0) {
        let existingOrder = await getFullOrder(conn, (existing as any[])[0].orderId);
        if (existingOrder) existingOrder = mapOrderForFrontend(existingOrder);
        await conn.commit();
        return res.status(200).json(existingOrder);
      }
    }

    // Validate products and compute totals
    const canonicalItems: any[] = [];
    let computedSubtotal = 0;

    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity < 1) {
        await conn.rollback();
        return res.status(400).json({ error: 'Invalid item in order' });
      }

      // SELECT FOR UPDATE: locks the row so concurrent transactions can't read stale stock
      const [productRows] = await conn.execute(
        'SELECT id, name, price, stockQuantity, trackInventory, inStock, status, isVisible FROM products WHERE id = ? FOR UPDATE',
        [item.productId]
      );

      if ((productRows as any[]).length === 0) {
        await conn.rollback();
        return res.status(400).json({ error: `Product not found: ${item.productId}` });
      }

      const product = (productRows as any[])[0];

      if (product.status === 'draft' || product.isVisible === 0) {
        await conn.rollback();
        return res.status(400).json({ error: `Product is unavailable: ${product.name}` });
      }

      const qty = Number(item.quantity);
      const stock = Number(product.stockQuantity);
      const tracks = product.trackInventory === 1 || product.trackInventory === true || product.trackInventory === '1';

      if (tracks) {
        if (product.inStock === 0 || product.inStock === false || stock < qty) {
          await conn.rollback();
          return res.status(400).json({ error: `${product.name} does not have enough stock (available: ${stock}, requested: ${qty})` });
        }
      }
      const unitPrice = Number(item.price || product.price);
      computedSubtotal += unitPrice * qty;

      canonicalItems.push({
        productId: product.id,
        productName: product.name,
        quantity: qty,
        price: unitPrice,
        image: item.image || null,
        selectedVariant: item.selectedVariant || null,
        variationId: item.variationId || null,
        trackInventory: tracks
      });
    }

    // Fetch shipping settings
    const [settingsRows] = await conn.execute('SELECT standardShippingFee, freeShippingThreshold FROM settings LIMIT 1');
    const settings = (settingsRows as any[])[0] || { standardShippingFee: 200, freeShippingThreshold: 3000 };
    const discount = Math.max(0, Number(discountAmount));
    const afterDiscount = Math.max(0, computedSubtotal - discount);
    const shippingFee = clientShippingFee !== undefined ? Number(clientShippingFee) : (afterDiscount >= Number(settings.freeShippingThreshold) ? 0 : Number(settings.standardShippingFee));
    const total = afterDiscount + shippingFee;

    // Create the order
    const orderId = generateOrderId();
    const internalId = crypto.randomBytes(12).toString('hex');
    const now = new Date();

    await conn.execute(
      `INSERT INTO orders (id, orderId, guestEmail, guestPhone, total, subtotal, shippingFee, discountAmount, status, paymentMethod, shippingAddress, appliedCoupon, checkoutRequestId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        internalId, orderId, email ? email.trim().toLowerCase() : null, phone,
        total, computedSubtotal, shippingFee, discount,
        'Pending', 'COD',
        JSON.stringify(shippingAddress || {}),
        appliedCoupon ? JSON.stringify(appliedCoupon) : null,
        checkoutRequestId || null,
        now, now
      ]
    );

    // Insert order_items and atomically deduct stock in the same transaction
    for (const item of canonicalItems) {
      const itemId = crypto.randomBytes(12).toString('hex');
      await conn.execute(
        `INSERT INTO order_items (id, order_id, productId, productName, quantity, price, image, selectedVariant, variationId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [itemId, internalId, item.productId, item.productName, item.quantity, item.price, item.image, item.selectedVariant, item.variationId]
      );

      // Atomic stock deduction with UPDATE WHERE constraint prevents negative stock
      if (item.trackInventory) {
        const [stockResult] = await conn.execute(
          `UPDATE products SET stockQuantity = stockQuantity - ?, updatedAt = ? WHERE id = ? AND stockQuantity >= ?`,
          [item.quantity, now, item.productId, item.quantity]
        );

        if ((stockResult as any).affectedRows === 0) {
          // Stock ran out between our SELECT FOR UPDATE and this UPDATE — rollback!
          await conn.rollback();
          return res.status(400).json({ error: `${item.productName} ran out of stock. Please refresh and try again.` });
        }
      }
    }

    // Add initial status history entry
    await conn.execute(
      `INSERT INTO order_status_history (id, order_id, status, note, timestamp) VALUES (?, ?, ?, ?, ?)`,
      [crypto.randomBytes(12).toString('hex'), internalId, 'Pending', 'Order placed', now]
    );

    await conn.commit();

    // Fetch the complete order after commit
    const dbOrder = await getFullOrder(pool, orderId);
    const newOrder = dbOrder ? mapOrderForFrontend(dbOrder) : null;

    // Fire-and-forget CAPI events + emails (same pattern as MongoDB version)
    const metaEventId = `purchase_${orderId}`;

    void (async () => {
      try { 
        await sendOrderConfirmationEmail(newOrder, {}); 
        const bgConn = await pool.getConnection();
        await bgConn.execute('UPDATE orders SET confirmationEmailSentAt = NOW(), confirmationEmailAccepted = 1 WHERE orderId = ?', [orderId]);
        bgConn.release();
      } catch (e) { 
        logEmailFailure('Order confirmation', orderId, e); 
        const bgConn = await pool.getConnection();
        await bgConn.execute('UPDATE orders SET confirmationEmailAccepted = 0 WHERE orderId = ?', [orderId]);
        bgConn.release();
      }
      try {
        const recipients = getAdminNotificationRecipients();
        if (recipients.length > 0) await sendAdminNewOrderEmail(newOrder, recipients);
      } catch (e) { logEmailFailure('Admin new order', orderId, e); }
      try {
        const capiOrder = { ...newOrder, email: newOrder.guestEmail, phone: newOrder.guestPhone, customerName: newOrder.shippingAddress?.name };
        await sendMetaPurchase({ order: capiOrder, req, eventId: metaEventId });
        console.log(`[Meta CAPI] Tracked order ${orderId}`);
      } catch (e) { console.error(`[Meta CAPI] Could not track order ${orderId}:`, e); }
      try {
        const capiOrder = { ...newOrder, email: newOrder.guestEmail, phone: newOrder.guestPhone, customerName: newOrder.shippingAddress?.name };
        await sendTikTokPurchase({ order: capiOrder, req, eventId: metaEventId });
        console.log(`[TikTok Events API] Tracked order ${orderId}`);
      } catch (e) { console.error(`[TikTok Events API] Could not track order ${orderId}:`, e); }
    })();

    res.status(201).json(newOrder);
  } catch (err: any) {
    await conn.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// PUT Update Order Status (Admin)
router.put('/:orderId/status', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    const { status, note } = req.body;
    const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      await conn.rollback();
      return res.status(400).json({ error: 'Invalid order status' });
    }

    const [orderRows] = await conn.execute('SELECT * FROM orders WHERE orderId = ? FOR UPDATE', [req.params.orderId]);
    if ((orderRows as any[]).length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = (orderRows as any[])[0];
    const previousStatus = order.status;
    const now = new Date();

    // If cancelling — restore stock
    if (status === 'Cancelled' && previousStatus !== 'Cancelled') {
      const [items] = await conn.execute('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
      for (const item of items as any[]) {
        await conn.execute(
          `UPDATE products SET stockQuantity = stockQuantity + ?, updatedAt = ? WHERE id = ? AND trackInventory = 1`,
          [item.quantity, now, item.productId]
        );
      }
    }

    await conn.execute(
      'UPDATE orders SET status = ?, updatedAt = ? WHERE id = ?',
      [status, now, order.id]
    );

    // Log to order_status_history
    await conn.execute(
      `INSERT INTO order_status_history (id, order_id, status, note, timestamp) VALUES (?, ?, ?, ?, ?)`,
      [crypto.randomBytes(12).toString('hex'), order.id, status, note || `Status changed from ${previousStatus} to ${status}`, now]
    );

    await conn.commit();

    let updatedOrder = await getFullOrder(pool, req.params.orderId);
    if (updatedOrder) updatedOrder = mapOrderForFrontend(updatedOrder);

    // Fire status email (non-blocking)
    if (previousStatus !== status && updatedOrder?.guestEmail) {
      void sendOrderStatusEmail(updatedOrder).catch((e: any) => logEmailFailure('Order status', req.params.orderId, e));
    }

    res.json({ order: updatedOrder, notification: { statusChanged: previousStatus !== status } });
  } catch (err: any) {
    await conn.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// PUT Update Tracking Number (Admin)
router.put('/:orderId/tracking', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { trackingNumber } = req.body;
    const [result] = await pool.execute(
      'UPDATE orders SET trackingNumber = ?, updatedAt = ? WHERE orderId = ?',
      [trackingNumber, new Date(), req.params.orderId]
    );
    if ((result as any).affectedRows === 0) return res.status(404).json({ error: 'Order not found' });
    const updated = await getFullOrder(pool, req.params.orderId);
    res.json(updated ? mapOrderForFrontend(updated) : null);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE Order (Admin)
router.delete('/:orderId', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const [orderRows] = await pool.execute('SELECT id FROM orders WHERE orderId = ?', [req.params.orderId]);
    if ((orderRows as any[]).length === 0) return res.status(404).json({ error: 'Order not found' });
    const orderIdInternal = (orderRows as any[])[0].id;

    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      await conn.execute('DELETE FROM order_items WHERE order_id = ?', [orderIdInternal]);
      await conn.execute('DELETE FROM order_status_history WHERE order_id = ?', [orderIdInternal]);
      await conn.execute('DELETE FROM orders WHERE id = ?', [orderIdInternal]);
      await conn.commit();
      res.json({ message: 'Order deleted successfully' });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
