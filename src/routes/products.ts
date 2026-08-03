import { Router, Request, Response } from 'express';
import Product from '../models/Product.js';
import multer from 'multer';
import csvParser from 'csv-parser';
import { Parser } from 'json2csv';
import { Readable } from 'node:stream';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

type CsvProductRow = Record<string, string>;

const parseCsvBuffer = (buffer: Buffer) =>
  new Promise<CsvProductRow[]>((resolve, reject) => {
    const results: CsvProductRow[] = [];

    Readable.from([buffer])
      .pipe(csvParser())
      .on('data', (data: CsvProductRow) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });

const ALLOWED_RICH_TEXT_TAGS = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'ul',
  'ol',
  'li',
  'a'
]);

const sanitizeRichText = (value: unknown): string => {
  if (typeof value !== 'string') return '';

  return value
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (tag, rawName: string, attributes: string) => {
      const name = rawName.toLowerCase();
      if (!ALLOWED_RICH_TEXT_TAGS.has(name)) return '';
      if (tag.startsWith('</')) return `</${name}>`;
      if (name === 'br') return '<br>';
      if (name !== 'a') return `<${name}>`;

      const hrefMatch = attributes.match(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const href = (hrefMatch?.[1] || hrefMatch?.[2] || hrefMatch?.[3] || '').trim();
      if (!/^(https?:\/\/|mailto:|#)/i.test(href)) return '<a>';
      const safeHref = href.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">`;
    })
    .trim();
};

const sanitizePlainText = (value: unknown, maxLength: number): string =>
  sanitizeRichText(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

const toNumber = (value: unknown, field: string, options?: { integer?: boolean; optional?: boolean }) => {
  if ((value === undefined || value === null || value === '') && options?.optional) return undefined;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0 || (options?.integer && !Number.isInteger(numericValue))) {
    throw new Error(`${field} must be a non-negative${options?.integer ? ' integer' : ' number'}`);
  }
  return numericValue;
};

const createSlug = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const normalizeProductPayload = (body: Record<string, any>, current?: Record<string, any>) => {
  const merged: Record<string, any> = {
    ...(current || {}),
    ...body,
    specifications: {
      ...(current?.specifications || {}),
      ...(body.specifications || {})
    }
  };

  const name = sanitizePlainText(merged.name, 160);
  const description = sanitizeRichText(merged.description);
  const descriptionText = description.replace(/<[^>]+>/g, '').trim();
  const category = sanitizePlainText(merged.category, 120);
  const categorySlug = createSlug(merged.categorySlug || category);
  const ageGroup = sanitizePlainText(merged.ageGroup, 40);
  const slug = createSlug(merged.slug || name);
  const price = toNumber(merged.price, 'Price') as number;
  const originalPrice = toNumber(merged.originalPrice, 'Regular price', { optional: true });
  const stockQuantity = toNumber(merged.stockQuantity, 'Stock quantity', { integer: true }) as number;
  const lowStockThreshold = toNumber(merged.lowStockThreshold, 'Low stock alert', {
    integer: true,
    optional: true
  });
  const weight = toNumber(merged.weight, 'Weight', { optional: true });
  const customDeliveryFee = toNumber(merged.customDeliveryFee, 'Custom shipping fee', {
    optional: true
  });

  if (!name) throw new Error('Product name is required');
  if (!descriptionText) throw new Error('Detailed description is required');
  if (!category || !categorySlug) throw new Error('Category is required');
  if (!ageGroup) throw new Error('Age recommendation is required');
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('URL slug must contain lowercase letters, numbers, and hyphens only');
  }
  if (originalPrice !== undefined && price >= originalPrice) {
    throw new Error('Sale price must be lower than regular price');
  }

  const images = Array.isArray(merged.images)
    ? merged.images
        .filter((image: unknown): image is string => typeof image === 'string' && image.trim().length > 0)
        .map((image: string) => image.trim())
    : [];
  if (images.length === 0) throw new Error('A main product image is required');
  if (images.length > 9) throw new Error('A product can have one main image and up to 8 gallery images');

  const deliveryType = merged.deliveryType || 'store_threshold';
  if (!['store_threshold', 'category', 'fixed', 'free', 'none'].includes(deliveryType)) {
    throw new Error('Invalid delivery charge model');
  }
  if (deliveryType === 'fixed' && customDeliveryFee === undefined) {
    throw new Error('Custom shipping fee is required for fixed shipping');
  }

  const status = merged.status || 'published';
  if (!['draft', 'published'].includes(status)) throw new Error('Invalid publish status');

  const variants = Array.isArray(merged.variants)
    ? merged.variants
        .map((group: any, groupIndex: number) => ({
          id: sanitizePlainText(group.id, 80) || `group-${groupIndex + 1}`,
          name: sanitizePlainText(group.name, 80),
          options: Array.isArray(group.options)
            ? group.options
                .map((option: any, optionIndex: number) => {
                  const optionStock = toNumber(option.stockQuantity, 'Variant stock', {
                    integer: true,
                    optional: true
                  });
                  return {
                    id: sanitizePlainText(option.id, 80) || `option-${groupIndex + 1}-${optionIndex + 1}`,
                    name: sanitizePlainText(option.name, 100),
                    priceOffset: toNumber(option.priceOffset, 'Variant price adjustment', {
                      optional: true
                    }) || 0,
                    stockQuantity: optionStock,
                    inStock: optionStock === undefined ? option.inStock !== false : optionStock > 0,
                    sku: sanitizePlainText(option.sku, 80).toUpperCase() || undefined
                  };
                })
                .filter((option: any) => option.name)
            : []
        }))
        .filter((group: any) => group.name && group.options.length > 0)
    : [];

  const sku = sanitizePlainText(merged.sku, 80).toUpperCase() || undefined;
  const skuValues = [sku, ...variants.flatMap((group: any) => group.options.map((option: any) => option.sku))]
    .filter((value): value is string => Boolean(value));
  if (new Set(skuValues).size !== skuValues.length) {
    throw new Error('Product and variant SKUs must be unique');
  }

  const metaTitle = sanitizePlainText(merged.metaTitle, 70);
  const metaDescription = sanitizePlainText(merged.metaDescription, 180);

  return {
    name,
    slug,
    sku,
    price,
    originalPrice,
    discountPercent:
      originalPrice !== undefined ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0,
    rating: Number.isFinite(Number(merged.rating)) ? Number(merged.rating) : 5,
    reviewCount: Number.isFinite(Number(merged.reviewCount)) ? Number(merged.reviewCount) : 0,
    category,
    categorySlug,
    ageGroup,
    brand: sanitizePlainText(merged.brand, 100) || 'PlayBimboo',
    inStock: Boolean(merged.inStock) && stockQuantity > 0,
    stockQuantity,
    lowStockThreshold,
    images,
    shortDescription: sanitizePlainText(merged.shortDescription, 300),
    description,
    isVisible: merged.isVisible !== false,
    status,
    isFeatured: merged.isFeatured === true,
    weight,
    deliveryType,
    customDeliveryFee: deliveryType === 'fixed' ? customDeliveryFee : undefined,
    variants,
    features: Array.isArray(merged.features)
      ? merged.features.map((feature: unknown) => sanitizePlainText(feature, 160)).filter(Boolean)
      : [],
    safetyInfo: sanitizePlainText(merged.safetyInfo, 500),
    specifications: Object.fromEntries(
      Object.entries(merged.specifications || {}).map(([key, value]) => [
        sanitizePlainText(key, 80),
        sanitizePlainText(value, 160)
      ])
    ),
    tags: Array.isArray(merged.tags)
      ? merged.tags.map((tag: unknown) => sanitizePlainText(tag, 60)).filter(Boolean)
      : [],
    metaTitle,
    metaDescription
  };
};

const assertUniqueIdentifiers = async (
  product: ReturnType<typeof normalizeProductPayload>,
  excludedId?: string
) => {
  const idFilter = excludedId ? { _id: { $ne: excludedId } } : {};
  if (await Product.exists({ ...idFilter, slug: product.slug })) {
    throw new Error('URL slug is already used by another product');
  }

  const skus = [
    product.sku,
    ...product.variants.flatMap((group: any) =>
      group.options.map((option: any) => option.sku)
    )
  ].filter((value): value is string => Boolean(value));
  if (
    skus.length > 0 &&
    (await Product.exists({
      ...idFilter,
      $or: [{ sku: { $in: skus } }, { 'variants.options.sku': { $in: skus } }]
    }))
  ) {
    throw new Error('SKU is already used by another product or variant');
  }
};

// GET all products (Supports category, ageGroup, search, isVisible filter)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, ageGroup, search, isVisible, limit } = req.query;
    const filter: any = {};

    if (category && category !== 'all') {
      filter.categorySlug = category;
    }
    if (ageGroup && ageGroup !== 'all') {
      filter.ageGroup = ageGroup;
    }
    if (isVisible !== undefined) {
      filter.isVisible = isVisible === 'true';
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    let query = Product.find(filter).sort({ createdAt: -1 });
    if (limit) {
      query = query.limit(Number(limit));
    }

    const products = await query.exec();
    res.json(products);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET Export CSV
router.get('/export/csv', async (req: Request, res: Response) => {
  try {
    const products = await Product.find().lean();
    const fields = ['_id', 'name', 'slug', 'price', 'originalPrice', 'category', 'categorySlug', 'ageGroup', 'brand', 'stockQuantity', 'isVisible', 'deliveryType', 'description'];
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(products);

    res.header('Content-Type', 'text/csv');
    res.attachment('playbimboo-products.csv');
    return res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET single product by slug or ID
router.get('/:idOrSlug', async (req: Request, res: Response) => {
  try {
    const { idOrSlug } = req.params;
    let product = await Product.findOne({ slug: idOrSlug });
    if (!product && idOrSlug.match(/^[0-9a-fA-F]{24}$/)) {
      product = await Product.findById(idOrSlug);
    }

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST Create Product
router.post('/', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const payload = normalizeProductPayload(req.body);
    await assertUniqueIdentifiers(payload);
    const newProduct = new Product(payload);
    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (err: any) {
    const isConflict = err?.code === 11000 || /already used|unique/i.test(err.message);
    res.status(isConflict ? 409 : 400).json({ error: err.message });
  }
});

// PUT Update Product
router.put('/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const payload = normalizeProductPayload(req.body, product.toObject());
    await assertUniqueIdentifiers(payload, product.id);
    product.set(payload);
    await product.save();
    res.json(product);
  } catch (err: any) {
    const isConflict = err?.code === 11000 || /already used|unique/i.test(err.message);
    res.status(isConflict ? 409 : 400).json({ error: err.message });
  }
});

// DELETE Product
router.delete('/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST Import CSV
router.post('/import/csv', authenticateToken, requireAdmin, upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a CSV file' });
  }

  try {
    const results = await parseCsvBuffer(req.file.buffer);

    for (const item of results) {
      if (item.name && item.price) {
        const slug = item.slug || item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await Product.findOneAndUpdate(
          { slug },
          {
            name: item.name,
            slug,
            price: Number(item.price),
            originalPrice: item.originalPrice ? Number(item.originalPrice) : undefined,
            category: item.category || 'Toys',
            categorySlug: item.categorySlug || 'toys',
            ageGroup: item.ageGroup || '3-5',
            brand: item.brand || 'PlayBimboo',
            stockQuantity: Number(item.stockQuantity) || 10,
            description: item.description || 'Quality toy for kids.',
            isVisible: item.isVisible === 'false' ? false : true,
            images: item.images ? item.images.split(',') : ['https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=600&q=80']
          },
          { upsert: true, new: true }
        );
      }
    }

    res.json({ message: `Successfully imported ${results.length} products` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
