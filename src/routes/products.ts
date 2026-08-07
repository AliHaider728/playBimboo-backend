import { Router, Request, Response } from 'express';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import multer from 'multer';
import csvParser from 'csv-parser';
import { Parser } from 'json2csv';
import { Readable } from 'node:stream';
import { AuthRequest, authenticateIfPresent, authenticateToken, requireAdmin } from '../middleware/auth.js';
import {
  deleteProductImages,
  hasCloudinaryConfiguration,
  isProductImagePublicId
} from '../lib/cloudinary.js';
import {
  normalizeAgeGroups,
  normalizeProductDetailBlocks,
  sanitizeProductDescription,
  sanitizeAndScopeProductCss,
  SUPPORTED_AGE_GROUPS
} from '../lib/productContent.js';
import { normalizeInventory } from '../lib/inventory.js';
import { getApprovedReviewSummaries, ReviewSummary } from '../lib/productReviews.js';
import { syncProductGlobalAttributes } from '../lib/globalAttributes.js';

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

const sanitizeRichText = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return sanitizeProductDescription(value);
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

export const serializeProduct = (value: any, reviewSummary?: ReviewSummary) => {
  // Mongoose Map values stringify as `{}` after a default `toObject()` call.
  // Flatten them here so variation/default attribute values survive every API read.
  const product = typeof value?.toObject === 'function'
    ? value.toObject({ flattenMaps: true })
    : { ...value };
  product.ageGroups = safelyNormalizeAgeGroups(product);
  delete product.ageGroup;
  try {
    product.productDetailBlocks = normalizeProductDetailBlocks(product.productDetailBlocks);
  } catch {
    product.productDetailBlocks = [];
  }
  // `description` is canonical. `detailedDescription` is a read-only fallback for legacy documents.
  product.description = sanitizeProductDescription(product.description ?? product.detailedDescription);
  delete product.detailedDescription;
  const productInventory = normalizeInventory(product);
  Object.assign(product, productInventory, {
    stockQuantity: productInventory.trackInventory ? productInventory.stockQuantity : null,
    lowStockThreshold: productInventory.trackInventory ? productInventory.lowStockThreshold : null
  });
  product.variants = Array.isArray(product.variants)
    ? product.variants.map((group: any) => ({
        ...group,
        options: Array.isArray(group.options)
          ? group.options.map((option: any) => {
              const inventory = normalizeInventory(option);
              return {
                ...option,
                ...inventory,
                stockQuantity: inventory.trackInventory ? inventory.stockQuantity : null,
                lowStockThreshold: inventory.trackInventory ? inventory.lowStockThreshold : null
              };
            })
          : []
      }))
    : [];
  product.category = typeof product.category === 'string' ? product.category : '';
  product.categorySlug = typeof product.categorySlug === 'string' ? product.categorySlug : '';
  product.categoryId = typeof product.categoryId === 'string' ? product.categoryId : '';
  product.categoryIds = Array.isArray(product.categoryIds) && product.categoryIds.length > 0
    ? [...new Set(product.categoryIds.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0))]
    : product.categoryId ? [product.categoryId] : [];
  product.categoryNames = Array.isArray(product.categoryNames) && product.categoryNames.length > 0
    ? [...new Set(product.categoryNames.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0))]
    : product.category ? [product.category] : [];
  product.categorySlugs = Array.isArray(product.categorySlugs) && product.categorySlugs.length > 0
    ? [...new Set(product.categorySlugs.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0))]
    : product.categorySlug ? [product.categorySlug] : [];
  product.rating = reviewSummary?.rating ?? 0;
  product.reviewCount = reviewSummary?.reviewCount ?? 0;
  return product;
};

const serializeProducts = async (values: any[]) => {
  const plainValues = values.map(value => typeof value?.toObject === 'function'
    ? value.toObject({ flattenMaps: true })
    : { ...value });
  const summaries = await getApprovedReviewSummaries(plainValues);
  return values.map((value, index) => {
    const key = String(plainValues[index]._id || plainValues[index].id || '');
    return serializeProduct(value, summaries.get(key));
  });
};

const getProductImagePublicIds = (product: Record<string, any>) => [
  ...(Array.isArray(product.imagePublicIds) ? product.imagePublicIds : []),
  ...(Array.isArray(product.imageThumbnailPublicIds) ? product.imageThumbnailPublicIds : []),
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
      { imageThumbnailPublicIds: { $in: uniqueIds } },
      { 'productDetailBlocks.image.publicId': { $in: uniqueIds } }
    ]
  }).select('imagePublicIds imageThumbnailPublicIds productDetailBlocks.image.publicId').lean();
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
  // New writes always persist the canonical `description`; legacy `detailedDescription` only fills a missing value.
  const description = sanitizeProductDescription(merged.description ?? merged.detailedDescription);
  const descriptionText = description.replace(/<[^>]+>/g, '').trim();
  const category = sanitizePlainText(merged.category, 120);
  const categorySlug = category ? createSlug(merged.categorySlug || category) : '';
  const categoryId = sanitizePlainText(merged.categoryId, 80);
  const categoryIds = [...new Set(
    (Array.isArray(merged.categoryIds) ? merged.categoryIds : categoryId ? [categoryId] : [])
      .map((value: unknown) => sanitizePlainText(value, 80))
      .filter(Boolean)
  )];
  const slug = createSlug(merged.slug || name);
  const ageGroups = normalizeAgeGroups(merged.ageGroups, merged.ageGroup);
  const productDetailBlocks = normalizeProductDetailBlocks(merged.productDetailBlocks);
  const productDetailCss = sanitizeAndScopeProductCss(merged.productDetailCustomCss, slug);
  const price = toNumber(merged.price, 'Price') as number;
  const originalPrice = toNumber(merged.originalPrice, 'Regular price', { optional: true });
  const requestedTracking = typeof merged.trackInventory === 'boolean'
    ? merged.trackInventory
    : merged.stockQuantity !== undefined && merged.stockQuantity !== null && merged.stockQuantity !== '';
  const stockQuantity = requestedTracking
    ? toNumber(merged.stockQuantity, 'Stock quantity', { integer: true }) as number
    : undefined;
  const lowStockThreshold = requestedTracking
    ? toNumber(merged.lowStockThreshold, 'Low stock alert', { integer: true, optional: true })
    : undefined;
  const inventory = normalizeInventory({
    ...merged,
    trackInventory: requestedTracking,
    stockQuantity,
    lowStockThreshold
  });
  const weight = toNumber(merged.weight, 'Weight', { optional: true });
  const customDeliveryFee = toNumber(merged.customDeliveryFee, 'Custom shipping fee', {
    optional: true
  });

  if (!name) throw new Error('Product name is required');
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

  const existingThumbnailsByImageUrl = new Map<string, { url: string; publicId: string }>();
  if (Array.isArray(current?.images)) {
    current.images.forEach((image: unknown, index: number) => {
      const thumbnailUrl = current?.imageThumbnailUrls?.[index];
      const thumbnailPublicId = current?.imageThumbnailPublicIds?.[index];
      if (typeof image === 'string') {
        existingThumbnailsByImageUrl.set(image, {
          url: typeof thumbnailUrl === 'string' ? thumbnailUrl : '',
          publicId: typeof thumbnailPublicId === 'string' ? thumbnailPublicId : ''
        });
      }
    });
  }
  const submittedThumbnailUrls = Array.isArray(body.imageThumbnailUrls)
    ? body.imageThumbnailUrls
    : undefined;
  const submittedThumbnailPublicIds = Array.isArray(body.imageThumbnailPublicIds)
    ? body.imageThumbnailPublicIds
    : undefined;
  const imageThumbnailUrls = images.map((image: string, index: number) => {
    const submitted = submittedThumbnailUrls?.[index];
    const url = typeof submitted === 'string'
      ? submitted.trim()
      : existingThumbnailsByImageUrl.get(image)?.url || '';
    if (url) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') throw new Error();
      } catch {
        throw new Error('Product thumbnail URLs must be secure Cloudinary URLs');
      }
    }
    return url;
  });
  const imageThumbnailPublicIds = images.map((image: string, index: number) => {
    const submitted = submittedThumbnailPublicIds?.[index];
    const publicId = typeof submitted === 'string'
      ? submitted.trim()
      : existingThumbnailsByImageUrl.get(image)?.publicId || '';
    if (publicId && !isProductImagePublicId(publicId)) {
      throw new Error('Invalid PlayBimboo product thumbnail public ID');
    }
    if (Boolean(publicId) !== Boolean(imageThumbnailUrls[index])) {
      throw new Error('Product thumbnail URL and public ID must be provided together');
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
                  const optionTracksInventory = typeof option.trackInventory === 'boolean'
                    ? option.trackInventory
                    : option.stockQuantity !== undefined && option.stockQuantity !== null && option.stockQuantity !== '';
                  const optionStock = optionTracksInventory
                    ? toNumber(option.stockQuantity, 'Variant stock', { integer: true }) as number
                    : undefined;
                  const optionInventory = normalizeInventory({
                    ...option,
                    trackInventory: optionTracksInventory,
                    stockQuantity: optionStock
                  });
                  return {
                    id: sanitizePlainText(option.id, 80) || `option-${groupIndex + 1}-${optionIndex + 1}`,
                    name: sanitizePlainText(option.name, 100),
                    priceOffset: toNumber(option.priceOffset, 'Variant price adjustment', {
                      optional: true
                    }) || 0,
                    ...optionInventory,
                    stockQuantity: optionInventory.trackInventory ? optionInventory.stockQuantity : null,
                    lowStockThreshold: optionInventory.trackInventory ? optionInventory.lowStockThreshold : null,
                    sku: sanitizePlainText(option.sku, 80).toUpperCase() || undefined
                  };
                })
                .filter((option: any) => option.name)
            : []
        }))
        .filter((group: any) => group.name && group.options.length > 0)
    : [];

  const productType = merged.productType === 'variable' ? 'variable' : 'simple';

  const attributes = Array.isArray(merged.attributes)
    ? merged.attributes.map((attr: any, attrIndex: number) => {
        const displayType = ['dropdown', 'buttons', 'radio', 'color_swatches', 'image_swatches'].includes(attr.displayType) 
          ? attr.displayType 
          : 'buttons';
        return {
          source: attr.source === 'global' ? 'global' : 'custom',
          globalAttributeId: attr.source === 'global' ? sanitizePlainText(attr.globalAttributeId, 80) : undefined,
          id: sanitizePlainText(attr.id, 80) || `attr-${attrIndex + 1}`,
          name: sanitizePlainText(attr.name, 80),
          slug: createSlug(attr.slug || attr.name),
          displayType,
          terms: Array.isArray(attr.terms) ? attr.terms.map((t: any) => ({
            id: sanitizePlainText(t.id, 80),
            label: sanitizePlainText(t.label, 80),
            slug: createSlug(t.slug || t.label),
            value: sanitizePlainText(t.value, 80),
            colorValue: sanitizePlainText(t.colorValue, 20) || undefined,
            imageUrl: typeof t.imageUrl === 'string' && t.imageUrl.startsWith('http') ? t.imageUrl : undefined,
            imageAlt: sanitizePlainText(t.imageAlt, 80) || undefined,
            position: Number(t.position) || 0
          })).filter((t: any) => t.label && t.value && t.slug) : [],
          selectedTermIds: Array.isArray(attr.selectedTermIds) ? attr.selectedTermIds.map((id: string) => sanitizePlainText(id, 80)) : [],
          visible: attr.visible !== false,
          usedForVariations: attr.usedForVariations !== false,
          position: Number(attr.position) || attrIndex,
          displayTypeOverride: attr.displayTypeOverride ? sanitizePlainText(attr.displayTypeOverride, 20) : undefined
        };
      }).filter((attr: any) => attr.name && attr.slug)
    : [];

  const variations = Array.isArray(merged.variations)
    ? merged.variations.map((variation: any, varIndex: number) => {
        const varTracksInventory = typeof variation.manageStock === 'boolean'
          ? variation.manageStock
          : variation.stockQuantity !== undefined && variation.stockQuantity !== null && variation.stockQuantity !== '';
        const varStock = varTracksInventory
          ? toNumber(variation.stockQuantity, 'Variation stock', { integer: true }) as number
          : undefined;
        const varInventory = normalizeInventory({
          ...variation,
          trackInventory: varTracksInventory,
          stockQuantity: varStock
        });

        const attrMap: Record<string, string> = {};
        if (variation.attributes && typeof variation.attributes === 'object') {
          const variationAttributeEntries: Array<[string, unknown]> = variation.attributes instanceof Map
            ? Array.from(variation.attributes.entries()) as Array<[string, unknown]>
            : Object.entries(variation.attributes);
          for (const [k, v] of variationAttributeEntries) {
            attrMap[sanitizePlainText(k, 80)] = sanitizePlainText(v, 80);
          }
        }

        const salePrice = toNumber(variation.salePrice, 'Variation sale price', { optional: true });
        const regularPrice = toNumber(variation.regularPrice, 'Variation regular price') || price;
        if (salePrice !== undefined && salePrice >= regularPrice) {
          throw new Error('Variation sale price must be lower than regular price');
        }

        return {
          id: sanitizePlainText(variation.id, 80) || `var-${varIndex + 1}`,
          attributes: attrMap,
          enabled: variation.enabled !== false,
          sku: sanitizePlainText(variation.sku, 80).toUpperCase() || undefined,
          regularPrice,
          salePrice,
          image: variation.image?.url ? {
            url: variation.image.url.trim(),
            publicId: variation.image.publicId?.trim() || undefined,
            alt: variation.image.alt?.trim() || undefined
          } : undefined,
          ...varInventory,
          manageStock: varInventory.trackInventory,
          stockQuantity: varInventory.trackInventory ? varInventory.stockQuantity : null,
          lowStockThreshold: varInventory.trackInventory ? varInventory.lowStockThreshold : null,
          weight: toNumber(variation.weight, 'Variation weight', { optional: true }),
          description: sanitizePlainText(variation.description, 500)
        };
      })
    : [];

  const defaultAttributes: Record<string, string> = {};
  if (merged.defaultAttributes && typeof merged.defaultAttributes === 'object') {
    const defaultAttributeEntries: Array<[string, unknown]> = merged.defaultAttributes instanceof Map
      ? Array.from(merged.defaultAttributes.entries()) as Array<[string, unknown]>
      : Object.entries(merged.defaultAttributes);
    for (const [k, v] of defaultAttributeEntries) {
      defaultAttributes[sanitizePlainText(k, 80)] = sanitizePlainText(v, 80);
    }
  }

  let defaultVariationId = sanitizePlainText(merged.defaultVariationId, 80) || undefined;
  let defaultVariation = defaultVariationId
    ? variations.find((variation: any) => variation.enabled && variation.id === defaultVariationId)
    : undefined;
  if (!defaultVariation && Object.keys(defaultAttributes).length > 0) {
    defaultVariation = variations.find((variation: any) =>
      variation.enabled && Object.entries(defaultAttributes).every(
        ([key, value]) => variation.attributes[key] === value
      )
    );
  }
  if (defaultVariation) {
    defaultVariationId = defaultVariation.id;
    Object.keys(defaultAttributes).forEach(key => delete defaultAttributes[key]);
    Object.assign(defaultAttributes, defaultVariation.attributes);
  } else if (productType !== 'variable') {
    defaultVariationId = undefined;
    Object.keys(defaultAttributes).forEach(key => delete defaultAttributes[key]);
  }

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
    rating: Number.isFinite(Number(current?.rating)) ? Number(current?.rating) : 0,
    reviewCount: Number.isFinite(Number(current?.reviewCount)) ? Number(current?.reviewCount) : 0,
    category,
    categorySlug,
    categoryId: categoryIds[0] || (category ? categoryId : ''),
    categoryIds,
    categoryNames: Array.isArray(merged.categoryNames)
      ? merged.categoryNames.map((value: unknown) => sanitizePlainText(value, 120)).filter(Boolean)
      : category ? [category] : [],
    categorySlugs: Array.isArray(merged.categorySlugs)
      ? merged.categorySlugs.map((value: unknown) => createSlug(value)).filter(Boolean)
      : categorySlug ? [categorySlug] : [],
    ageGroups,
    brand: sanitizePlainText(merged.brand, 100) || 'PlayBimboo',
    ...inventory,
    stockQuantity: inventory.trackInventory ? inventory.stockQuantity : null,
    lowStockThreshold: inventory.trackInventory ? inventory.lowStockThreshold : null,
    images,
    imagePublicIds,
    imageThumbnailUrls,
    imageThumbnailPublicIds,
    shortDescription: sanitizePlainText(merged.shortDescription, 300),
    description,
    isVisible: merged.isVisible !== false,
    status,
    isFeatured: merged.isFeatured === true,
    isBestseller: merged.isBestseller === true,
    isNewArrival: merged.isNewArrival === true,
    isSpotlight: merged.isSpotlight === true,
    weight,
    deliveryType,
    customDeliveryFee: deliveryType === 'fixed' ? customDeliveryFee : undefined,
    variants,
    productType,
    attributes,
    variations,
    defaultAttributes,
    defaultVariationId,
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
    productDetailScopedCss: productDetailCss.scoped,
    sizeGuide: sanitizeProductDescription(merged.sizeGuide) || undefined
  };
};

const resolveCategoryReference = async (payload: ReturnType<typeof normalizeProductPayload>) => {
  if (payload.categoryIds.length === 0) {
    return {
      ...payload,
      categoryIds: [],
      categoryNames: payload.category ? [payload.category] : [],
      categorySlugs: payload.categorySlug ? [payload.categorySlug] : []
    };
  }
  const categories = await Category.find({
    _id: { $in: payload.categoryIds },
    isActive: { $ne: false }
  });
  const byId = new Map(categories.map(category => [category.id, category]));
  const ordered = payload.categoryIds.map(id => byId.get(id));
  if (ordered.some(category => !category)) throw new Error('One or more selected categories are unavailable');
  const resolved = ordered.filter((category): category is NonNullable<typeof category> => Boolean(category));
  const primary = resolved[0]!;
  return {
    ...payload,
    category: primary.name,
    categorySlug: primary.slug,
    categoryId: primary.id,
    categoryIds: resolved.map(category => category.id),
    categoryNames: resolved.map(category => category.name),
    categorySlugs: resolved.map(category => category.slug)
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
    ),
    ...product.variations.map((v: any) => v.sku)
  ].filter((value): value is string => Boolean(value));
  if (
    skus.length > 0 &&
    (await Product.exists({
      ...idFilter,
      $or: [{ sku: { $in: skus } }, { 'variants.options.sku': { $in: skus } }, { 'variations.sku': { $in: skus } }]
    }))
  ) {
    throw new Error('SKU is already used by another product or variation');
  }
};

// GET all products (Supports category, ageGroup, search, isVisible filter)
router.get('/', authenticateIfPresent, async (req: AuthRequest, res: Response) => {
  try {
    res.set('Cache-Control', 'no-store, max-age=0');
    const { category, ageGroup, search, isVisible, limit } = req.query;
    const filter: any = {};
    const adminRead = ['admin', 'super_admin'].includes(req.user?.role || '');
    if (!adminRead) {
      filter.isVisible = { $ne: false };
      filter.status = { $ne: 'draft' };
    }

    if (category && category !== 'all') {
      filter.$and = [
        ...(filter.$and || []),
        { $or: [{ categorySlugs: category }, { categorySlug: category }] }
      ];
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
    if (isVisible !== undefined && adminRead) {
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
    res.json(await serializeProducts(products));
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
    const fields = ['_id', 'name', 'slug', 'price', 'originalPrice', 'category', 'categorySlug', 'categoryIds', 'categoryNames', 'categorySlugs', 'ageGroups', 'brand', 'stockQuantity', 'isVisible', 'isFeatured', 'isBestseller', 'isNewArrival', 'isSpotlight', 'deliveryType', 'description'];
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
        category: item.category || '',
        categorySlug: item.categorySlug || '',
        categoryIds: (item.categoryIds || '').split(/[|,]/).map(value => value.trim()).filter(Boolean),
        ageGroups,
        brand: item.brand || 'PlayBimboo',
        trackInventory: item.trackInventory === 'true' || Boolean(item.stockQuantity?.trim()),
        stockQuantity: item.stockQuantity?.trim() ? Number(item.stockQuantity) : undefined,
        stockStatus: item.stockStatus || (item.inStock === 'false' ? 'out_of_stock' : 'in_stock'),
        description: item.description || 'Quality toy for kids.',
        isVisible: item.isVisible !== 'false',
        isFeatured: item.isFeatured === 'true',
        isBestseller: item.isBestseller === 'true',
        isNewArrival: item.isNewArrival === 'true',
        isSpotlight: item.isSpotlight === 'true',
        images: item.images
          ? item.images.split(',').map(value => value.trim()).filter(Boolean)
          : existing?.images || ['https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=600&q=80']
      };
      const payload = await resolveCategoryReference(normalizeProductPayload(input, existing?.toObject()));
      payload.attributes = await syncProductGlobalAttributes(payload.attributes);
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
router.get('/:idOrSlug', authenticateIfPresent, async (req: AuthRequest, res: Response) => {
  try {
    res.set('Cache-Control', 'no-store, max-age=0');
    const { idOrSlug } = req.params;
    const adminRead = ['admin', 'super_admin'].includes(req.user?.role || '');
    const visibilityFilter = adminRead ? {} : { isVisible: { $ne: false }, status: { $ne: 'draft' } };
    let product = await Product.findOne({ slug: idOrSlug, ...visibilityFilter });
    if (!product && idOrSlug.match(/^[0-9a-fA-F]{24}$/)) {
      product = await Product.findOne({ _id: idOrSlug, ...visibilityFilter });
    }

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json((await serializeProducts([product]))[0]);
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
    const payload = await resolveCategoryReference(normalizeProductPayload(req.body));
    payload.attributes = await syncProductGlobalAttributes(payload.attributes);
    await assertUniqueIdentifiers(payload);
    if (payload.isSpotlight) await Product.updateMany({ isSpotlight: true }, { $set: { isSpotlight: false } });
    const newProduct = new Product(payload);
    await newProduct.save();
    res.status(201).json((await serializeProducts([newProduct]))[0]);
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
    const payload = await resolveCategoryReference(normalizeProductPayload(req.body, current));
    payload.attributes = await syncProductGlobalAttributes(payload.attributes);
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
    if (payload.isSpotlight) {
      await Product.updateMany({ _id: { $ne: product.id }, isSpotlight: true }, { $set: { isSpotlight: false } });
    }
    product.set(payload);
    product.set('ageGroup', undefined);
    await product.save();
    if (removedPublicIds.length > 0) {
      await deleteImagesUnusedByOtherProducts(removedPublicIds, product.id);
    }
    res.json((await serializeProducts([product]))[0]);
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
