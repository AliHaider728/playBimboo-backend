import { Router, Request, Response } from 'express';
import Product from '../models/Product.js';
import multer from 'multer';
import csvParser from 'csv-parser';
import { Parser } from 'json2csv';
import { Readable } from 'node:stream';
import { AuthRequest, authenticateToken, requireAdmin } from '../middleware/auth.js';
import {
  deleteProductImages,
  hasCloudinaryConfiguration,
  isProductImagePublicId
} from '../lib/cloudinary.js';
import {
  normalizeAgeGroups,
  normalizeProductDetailBlocks,
  sanitizeAndScopeProductCss,
  SUPPORTED_AGE_GROUPS
} from '../lib/productContent.js';

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

const safelyNormalizeAgeGroups = (product: Record<string, any>) => {
  try {
    return normalizeAgeGroups(product.ageGroups, product.ageGroup);
  } catch {
    return [];
  }
};

const serializeProduct = (value: any) => {
  const product = typeof value?.toObject === 'function' ? value.toObject() : { ...value };
  product.ageGroups = safelyNormalizeAgeGroups(product);
  delete product.ageGroup;
  product.productDetailBlocks = Array.isArray(product.productDetailBlocks)
    ? product.productDetailBlocks
    : [];
  return product;
};

const getProductImagePublicIds = (product: Record<string, any>) => [
  ...(Array.isArray(product.imagePublicIds) ? product.imagePublicIds : []),
  ...(Array.isArray(product.productDetailBlocks)
    ? product.productDetailBlocks.map((block: any) => block?.image?.publicId)
    : [])
].filter((value): value is string => typeof value === 'string' && value.length > 0);

const deleteImagesUnusedByOtherProducts = async (publicIds: string[], excludedProductId: string) => {
  const uniqueIds = [...new Set(publicIds)];
  if (uniqueIds.length === 0) return;
  const referenced = await Product.find({
    _id: { $ne: excludedProductId },
    $or: [
      { imagePublicIds: { $in: uniqueIds } },
      { 'productDetailBlocks.image.publicId': { $in: uniqueIds } }
    ]
  }).select('imagePublicIds productDetailBlocks.image.publicId').lean();
  const referencedIds = new Set(referenced.flatMap(product => getProductImagePublicIds(product)));
  const safeToDelete = uniqueIds.filter(publicId => !referencedIds.has(publicId));
  if (safeToDelete.length > 0) await deleteProductImages(safeToDelete);
};

export const requestChangesCustomCode = (body: Record<string, any>, current?: Record<string, any>) => {
  if (body.productDetailCustomCss !== undefined &&
      String(body.productDetailCustomCss) !== String(current?.productDetailCustomCss || '')) return true;
  if (body.productDetailBlocks === undefined) return false;
  const codeBlocks = (blocks: unknown) => Array.isArray(blocks)
    ? blocks
        .filter((block: any) => block?.type === 'html')
        .map((block: any) => ({
          id: block.id,
          type: block.type,
          enabled: block.enabled !== false,
          order: block.order,
          content: block.content || '',
          settings: block.settings || {}
        }))
    : [];
  return JSON.stringify(codeBlocks(body.productDetailBlocks)) !==
    JSON.stringify(codeBlocks(current?.productDetailBlocks));
};

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
  const slug = createSlug(merged.slug || name);
  const ageGroups = normalizeAgeGroups(merged.ageGroups, merged.ageGroup);
  const productDetailBlocks = normalizeProductDetailBlocks(merged.productDetailBlocks);
  const productDetailCss = sanitizeAndScopeProductCss(merged.productDetailCustomCss, slug);
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
  if (images.some((image: string) => {
    try {
      return new URL(image).protocol !== 'https:';
    } catch {
      return true;
    }
  })) {
    throw new Error('Product image URLs must use secure HTTPS URLs');
  }

  const existingPublicIdsByUrl = new Map<string, string>();
  if (Array.isArray(current?.images) && Array.isArray(current?.imagePublicIds)) {
    current.images.forEach((image: unknown, index: number) => {
      const publicId = current.imagePublicIds[index];
      if (typeof image === 'string' && typeof publicId === 'string' && publicId) {
        existingPublicIdsByUrl.set(image, publicId);
      }
    });
  }
  const submittedPublicIds = Array.isArray(body.imagePublicIds) ? body.imagePublicIds : undefined;
  const imagePublicIds = images.map((image: string, index: number) => {
    const submitted = submittedPublicIds?.[index];
    const publicId = typeof submitted === 'string'
      ? submitted.trim()
      : existingPublicIdsByUrl.get(image) || '';
    if (publicId && !isProductImagePublicId(publicId)) {
      throw new Error('Invalid PlayBimboo product image public ID');
    }
    if (publicId && new URL(image).hostname !== 'res.cloudinary.com') {
      throw new Error('Cloudinary public IDs must be paired with Cloudinary HTTPS URLs');
    }
    return publicId;
  });

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
    ageGroups,
    brand: sanitizePlainText(merged.brand, 100) || 'PlayBimboo',
    inStock: Boolean(merged.inStock) && stockQuantity > 0,
    stockQuantity,
    lowStockThreshold,
    images,
    imagePublicIds,
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
    metaDescription,
    productDetailBlocks,
    productDetailCustomCss: productDetailCss.raw,
    productDetailScopedCss: productDetailCss.scoped
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
      if (!SUPPORTED_AGE_GROUPS.includes(ageGroup as any)) {
        return res.status(400).json({ error: 'Unsupported age group filter' });
      }
      const legacyAgeValues = ageGroup === '9-12'
        ? ['9-12', '9-11', '8+']
        : ageGroup === '13+'
          ? ['13+', '8+']
          : [ageGroup];
      const legacyArrayValues = ['9-12', '13+'].includes(String(ageGroup))
        ? [ageGroup, '8+']
        : [ageGroup];
      filter.$and = [
        ...(filter.$and || []),
        { $or: [
          { ageGroups: { $in: legacyArrayValues } },
          { ageGroup: { $in: legacyAgeValues } }
        ] }
      ];
    }
    if (isVisible !== undefined) {
      filter.isVisible = isVisible === 'true';
    }
    if (search) {
      filter.$and = [
        ...(filter.$and || []),
        { $or: [
          { name: { $regex: search, $options: 'i' } },
          { brand: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ] }
      ];
    }

    let query = Product.find(filter).sort({ createdAt: -1 });
    if (limit) {
      query = query.limit(Number(limit));
    }

    const products = await query.exec();
    res.json(products.map(serializeProduct));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET Export CSV
router.get('/export/csv', authenticateToken, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const products = await Product.find().lean();
    const exportProducts = products.map(product => ({
      ...serializeProduct(product),
      ageGroups: safelyNormalizeAgeGroups(product).join('|')
    }));
    const fields = ['_id', 'name', 'slug', 'price', 'originalPrice', 'category', 'categorySlug', 'ageGroups', 'brand', 'stockQuantity', 'isVisible', 'deliveryType', 'description'];
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(exportProducts);

    res.header('Content-Type', 'text/csv');
    res.attachment('playbimboo-products.csv');
    return res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST Import CSV (must remain before /:idOrSlug)
router.post('/import/csv', authenticateToken, requireAdmin, upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Please upload a CSV file' });

  try {
    const rows = await parseCsvBuffer(req.file.buffer);
    let imported = 0;
    for (const item of rows) {
      if (!item.name || !item.price) continue;
      const slug = createSlug(item.slug || item.name);
      const existing = await Product.findOne({ slug });
      const ageGroups = (item.ageGroups || item.ageGroup || '3-5')
        .split(/[|,]/)
        .map(value => value.trim())
        .filter(Boolean);
      const input = {
        ...(existing?.toObject() || {}),
        name: item.name,
        slug,
        price: Number(item.price),
        originalPrice: item.originalPrice ? Number(item.originalPrice) : undefined,
        category: item.category || 'Toys',
        categorySlug: item.categorySlug || 'toys',
        ageGroups,
        brand: item.brand || 'PlayBimboo',
        stockQuantity: Number(item.stockQuantity) || 10,
        inStock: Number(item.stockQuantity) !== 0,
        description: item.description || 'Quality toy for kids.',
        isVisible: item.isVisible !== 'false',
        images: item.images
          ? item.images.split(',').map(value => value.trim()).filter(Boolean)
          : existing?.images || ['https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=600&q=80']
      };
      const payload = normalizeProductPayload(input, existing?.toObject());
      await assertUniqueIdentifiers(payload, existing?.id);
      if (existing) {
        existing.set(payload);
        existing.set('ageGroup', undefined);
        await existing.save();
      } else {
        await new Product(payload).save();
      }
      imported += 1;
    }
    res.json({ message: `Successfully imported ${imported} products` });
  } catch (err: any) {
    const isConflict = err?.code === 11000 || /already used|unique/i.test(err.message);
    res.status(isConflict ? 409 : 400).json({ error: err.message });
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
    res.json(serializeProduct(product));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST Create Product
router.post('/', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'super_admin' && requestChangesCustomCode(req.body)) {
      return res.status(403).json({ error: 'Only a Super Admin can add custom HTML or CSS.' });
    }
    const payload = normalizeProductPayload(req.body);
    await assertUniqueIdentifiers(payload);
    const newProduct = new Product(payload);
    await newProduct.save();
    res.status(201).json(serializeProduct(newProduct));
  } catch (err: any) {
    const isConflict = err?.code === 11000 || /already used|unique/i.test(err.message);
    res.status(isConflict ? 409 : 400).json({ error: err.message });
  }
});

// PUT Update Product
router.put('/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const current = product.toObject();
    if (req.user?.role !== 'super_admin' && requestChangesCustomCode(req.body, current)) {
      return res.status(403).json({ error: 'Only a Super Admin can update custom HTML or CSS.' });
    }
    const payload = normalizeProductPayload(req.body, current);
    await assertUniqueIdentifiers(payload, product.id);
    const oldPublicIds = getProductImagePublicIds(current);
    const newPublicIds = getProductImagePublicIds(payload);
    const removedPublicIds = oldPublicIds.filter(
      publicId => !newPublicIds.includes(publicId)
    );
    if (removedPublicIds.length > 0 && !hasCloudinaryConfiguration) {
      return res.status(503).json({
        error: 'Cannot replace or remove product images because Cloudinary is not configured.'
      });
    }
    product.set(payload);
    product.set('ageGroup', undefined);
    await product.save();
    if (removedPublicIds.length > 0) {
      await deleteImagesUnusedByOtherProducts(removedPublicIds, product.id);
    }
    res.json(serializeProduct(product));
  } catch (err: any) {
    const isConflict = err?.code === 11000 || /already used|unique/i.test(err.message);
    res.status(isConflict ? 409 : 400).json({ error: err.message });
  }
});

// DELETE Product
router.delete('/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const publicIds = getProductImagePublicIds(product.toObject());
    if (publicIds.length > 0 && !hasCloudinaryConfiguration) {
      return res.status(503).json({
        error: 'Cannot delete this product because Cloudinary image cleanup is not configured.'
      });
    }
    await product.deleteOne();
    if (publicIds.length > 0) {
      await deleteImagesUnusedByOtherProducts(publicIds, product.id);
    }
    res.json({ message: 'Product deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
