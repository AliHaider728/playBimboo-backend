import { Router } from 'express';
import { pool } from '../mysql-lib/db';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { randomUUID } from 'crypto';

const router = Router();

// Define product columns to match standardized structure (same as products.ts)
const PRODUCT_COLS_P = 'p.id, p.name, p.slug, p.sku, p.price, p.originalPrice, p.discountPercent, p.rating, p.reviewCount, p.categoryId, p.brand, p.inStock, p.trackInventory, p.stockQuantity, p.stockStatus, p.lowStockThreshold, p.isVisible, p.status, p.displayOrder, p.isFeatured, p.isBestseller, p.isNewArrival, p.isSpotlight, p.weight, p.deliveryType, p.customDeliveryFee, p.shortDescription, p.description, p.features, p.safetyInfo, p.specifications, p.tags, p.metaTitle, p.metaDescription, p.productDetailBlocks, p.pricingOffers, p.defaultAttributes, p.defaultVariationId, p.productType, p.createdAt, p.updatedAt';
const PRODUCT_IMAGE_COLS = 'id, product_id, url, publicId, isThumbnail, position';
const PRODUCT_VARIANT_COLS = 'id, product_id, sku, regularPrice, salePrice, manageStock, stockQuantity, stockStatus, weight, attributes, image, enabled';

// Helper to safely parse JSON
const parseJson = (val: any, fallback: any = null) => {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch (e) { return fallback; }
};

// ==========================================
// PUBLIC ROUTES
// ==========================================

// List all active bundles
router.get('/', async (req, res) => {
  try {
    const [bundles] = await pool.execute('SELECT * FROM bundles WHERE isActive = 1 ORDER BY displayOrder ASC');
    const bundlesArray = bundles as any[];

    if (bundlesArray.length === 0) {
      return res.json({ bundles: [] });
    }

    const bundleIds = bundlesArray.map(b => b.id);
    const placeholders = bundleIds.map(() => '?').join(',');

    // Fetch linked products
    const [linkedRows] = await pool.execute(`
      SELECT bp.bundle_id, bp.quantity as bundle_quantity, ${PRODUCT_COLS_P}
      FROM bundle_products bp
      JOIN products p ON bp.product_id = p.id
      WHERE bp.bundle_id IN (${placeholders})
      AND p.isVisible = 1 AND p.status != 'draft'
    `, bundleIds);
    const productsArray = linkedRows as any[];

    // If products exist, fetch images and variants for them
    let imagesByProduct = new Map();
    let variantsByProduct = new Map();
    
    if (productsArray.length > 0) {
      const productIds = Array.from(new Set(productsArray.map(p => p.id)));
      const pPlaceholders = productIds.map(() => '?').join(',');
      
      const [images] = await pool.execute(`SELECT ${PRODUCT_IMAGE_COLS} FROM product_images WHERE product_id IN (${pPlaceholders}) ORDER BY position ASC`, productIds);
      (images as any[]).forEach(img => {
        if (!imagesByProduct.has(img.product_id)) imagesByProduct.set(img.product_id, []);
        imagesByProduct.get(img.product_id).push(img);
      });

      const [variants] = await pool.execute(`SELECT ${PRODUCT_VARIANT_COLS} FROM product_variants WHERE product_id IN (${pPlaceholders})`, productIds);
      (variants as any[]).forEach(v => {
        if (!variantsByProduct.has(v.product_id)) variantsByProduct.set(v.product_id, []);
        variantsByProduct.get(v.product_id).push({ ...v, attributes: parseJson(v.attributes, {}), image: parseJson(v.image, null) });
      });
    }

    // Map everything together
    const result = bundlesArray.map(bundle => {
      const items = productsArray.filter(lp => lp.bundle_id === bundle.id).map(p => {
        return {
          ...p,
          bundle_quantity: p.bundle_quantity,
          features: parseJson(p.features, []),
          specifications: parseJson(p.specifications, []),
          tags: parseJson(p.tags, []),
          pricingOffers: parseJson(p.pricingOffers, []),
          images: (imagesByProduct.get(p.id) || []).map((img: any) => img.url),
          imagePublicIds: (imagesByProduct.get(p.id) || []).map((img: any) => img.publicId),
          variants: variantsByProduct.get(p.id) || []
        };
      });

      const originalTotalPrice = items.reduce((sum, item) => sum + (Number(item.price) * item.bundle_quantity), 0);
      const discountAmount = originalTotalPrice * (Number(bundle.discountPercent) / 100);
      const currentPrice = originalTotalPrice - discountAmount;

      return {
        ...bundle,
        isActive: bundle.isActive === 1,
        originalTotalPrice,
        currentPrice,
        products: items
      };
    });

    res.json({ bundles: result });
  } catch (error: any) {
    console.error('Error fetching bundles:', error);
    res.status(500).json({ error: 'Failed to fetch bundles' });
  }
});

// Single bundle detail
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const [bundles] = await pool.execute('SELECT * FROM bundles WHERE slug = ? AND isActive = 1 LIMIT 1', [slug]);
    const bundleRows = bundles as any[];

    if (bundleRows.length === 0) {
      return res.status(404).json({ error: 'Bundle not found' });
    }

    const bundle = bundleRows[0];

    const [linkedRows] = await pool.execute(`
      SELECT bp.bundle_id, bp.quantity as bundle_quantity, ${PRODUCT_COLS_P}
      FROM bundle_products bp
      JOIN products p ON bp.product_id = p.id
      WHERE bp.bundle_id = ?
      AND p.isVisible = 1 AND p.status != 'draft'
    `, [bundle.id]);
    const productsArray = linkedRows as any[];

    let imagesByProduct = new Map();
    let variantsByProduct = new Map();
    
    if (productsArray.length > 0) {
      const productIds = Array.from(new Set(productsArray.map(p => p.id)));
      const pPlaceholders = productIds.map(() => '?').join(',');
      
      const [images] = await pool.execute(`SELECT ${PRODUCT_IMAGE_COLS} FROM product_images WHERE product_id IN (${pPlaceholders}) ORDER BY position ASC`, productIds);
      (images as any[]).forEach(img => {
        if (!imagesByProduct.has(img.product_id)) imagesByProduct.set(img.product_id, []);
        imagesByProduct.get(img.product_id).push(img);
      });

      const [variants] = await pool.execute(`SELECT ${PRODUCT_VARIANT_COLS} FROM product_variants WHERE product_id IN (${pPlaceholders})`, productIds);
      (variants as any[]).forEach(v => {
        if (!variantsByProduct.has(v.product_id)) variantsByProduct.set(v.product_id, []);
        variantsByProduct.get(v.product_id).push({ ...v, attributes: parseJson(v.attributes, {}), image: parseJson(v.image, null) });
      });
    }

    const items = productsArray.map(p => ({
      ...p,
      bundle_quantity: p.bundle_quantity,
      features: parseJson(p.features, []),
      specifications: parseJson(p.specifications, []),
      tags: parseJson(p.tags, []),
      pricingOffers: parseJson(p.pricingOffers, []),
      images: (imagesByProduct.get(p.id) || []).map((img: any) => img.url),
      imagePublicIds: (imagesByProduct.get(p.id) || []).map((img: any) => img.publicId),
      variants: variantsByProduct.get(p.id) || []
    }));

    const originalTotalPrice = items.reduce((sum, item) => sum + (Number(item.price) * item.bundle_quantity), 0);
    const discountAmount = originalTotalPrice * (Number(bundle.discountPercent) / 100);
    const currentPrice = originalTotalPrice - discountAmount;

    res.json({
      ...bundle,
      isActive: bundle.isActive === 1,
      originalTotalPrice,
      currentPrice,
      products: items
    });
  } catch (error: any) {
    console.error('Error fetching bundle:', error);
    res.status(500).json({ error: 'Failed to fetch bundle' });
  }
});

// ==========================================
// ADMIN ROUTES
// ==========================================

router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { name, slug, description, image, discountPercent, isActive, displayOrder, products } = req.body;
    
    // Validate required fields
    if (!name || !slug) {
      return res.status(400).json({ error: 'Name and slug are required' });
    }

    // Check slug uniqueness
    const [existing] = await conn.execute('SELECT id FROM bundles WHERE slug = ?', [slug]);
    if ((existing as any[]).length > 0) {
      return res.status(400).json({ error: 'Slug already exists' });
    }

    // Validate products exist in the database
    let validProductsToInsert: {product_id: string, quantity: number}[] = [];
    if (products && Array.isArray(products) && products.length > 0) {
      const productIds = products.map(p => p.product_id);
      const placeholders = productIds.map(() => '?').join(',');
      
      const [existingProducts] = await conn.execute(
        `SELECT id FROM products WHERE id IN (${placeholders})`, 
        productIds
      );
      
      const existingProductIds = (existingProducts as any[]).map(p => p.id);
      
      // Verify all provided product_ids actually exist
      for (const p of products) {
        if (!existingProductIds.includes(p.product_id)) {
          conn.release();
          return res.status(400).json({ error: `Product ID ${p.product_id} does not exist in the database.` });
        }
        validProductsToInsert.push({ product_id: p.product_id, quantity: p.quantity || 1 });
      }
    }

    await conn.beginTransaction();
    const bundleId = randomUUID();

    await conn.execute(
      `INSERT INTO bundles (id, name, slug, description, image, discountPercent, isActive, displayOrder) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [bundleId, name, slug, description || '', image || null, discountPercent || 0, isActive !== false ? 1 : 0, displayOrder || 0]
    );

    if (validProductsToInsert.length > 0) {
      for (const p of validProductsToInsert) {
        await conn.execute(
          'INSERT INTO bundle_products (bundle_id, product_id, quantity) VALUES (?, ?, ?)',
          [bundleId, p.product_id, p.quantity]
        );
      }
    }

    await conn.commit();
    res.status(201).json({ success: true, bundleId });
  } catch (error: any) {
    await conn.rollback();
    console.error('Error creating bundle:', error);
    res.status(500).json({ error: 'Failed to create bundle' });
  } finally {
    conn.release();
  }
});

router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { name, slug, description, image, discountPercent, isActive, displayOrder, products } = req.body;
    
    const [existing] = await conn.execute('SELECT id FROM bundles WHERE id = ?', [id]);
    if ((existing as any[]).length === 0) {
      conn.release();
      return res.status(404).json({ error: 'Bundle not found' });
    }

    // Check slug uniqueness
    if (slug) {
      const [dup] = await conn.execute('SELECT id FROM bundles WHERE slug = ? AND id != ?', [slug, id]);
      if ((dup as any[]).length > 0) {
        conn.release();
        return res.status(400).json({ error: 'Slug already exists on another bundle' });
      }
    }

    // Validate products exist
    let validProductsToInsert: {product_id: string, quantity: number}[] = [];
    if (products && Array.isArray(products)) {
      if (products.length > 0) {
        const productIds = products.map(p => p.product_id);
        const placeholders = productIds.map(() => '?').join(',');
        
        const [existingProducts] = await conn.execute(
          `SELECT id FROM products WHERE id IN (${placeholders})`, 
          productIds
        );
        
        const existingProductIds = (existingProducts as any[]).map(p => p.id);
        
        for (const p of products) {
          if (!existingProductIds.includes(p.product_id)) {
            conn.release();
            return res.status(400).json({ error: `Product ID ${p.product_id} does not exist in the database.` });
          }
          validProductsToInsert.push({ product_id: p.product_id, quantity: p.quantity || 1 });
        }
      }
    }

    await conn.beginTransaction();

    const updates = [];
    const values = [];
    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (slug !== undefined) { updates.push('slug = ?'); values.push(slug); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (image !== undefined) { updates.push('image = ?'); values.push(image); }
    if (discountPercent !== undefined) { updates.push('discountPercent = ?'); values.push(discountPercent); }
    if (isActive !== undefined) { updates.push('isActive = ?'); values.push(isActive ? 1 : 0); }
    if (displayOrder !== undefined) { updates.push('displayOrder = ?'); values.push(displayOrder); }
    
    if (updates.length > 0) {
      values.push(id);
      await conn.execute(`UPDATE bundles SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    // Only update products if explicitly provided in payload
    if (products !== undefined) {
      await conn.execute('DELETE FROM bundle_products WHERE bundle_id = ?', [id]);
      
      for (const p of validProductsToInsert) {
        await conn.execute(
          'INSERT INTO bundle_products (bundle_id, product_id, quantity) VALUES (?, ?, ?)',
          [id, p.product_id, p.quantity]
        );
      }
    }

    await conn.commit();
    res.json({ success: true });
  } catch (error: any) {
    await conn.rollback();
    console.error('Error updating bundle:', error);
    res.status(500).json({ error: 'Failed to update bundle' });
  } finally {
    conn.release();
  }
});

router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute('DELETE FROM bundles WHERE id = ?', [id]);
    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ error: 'Bundle not found' });
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting bundle:', error);
    res.status(500).json({ error: 'Failed to delete bundle' });
  }
});

export default router;
