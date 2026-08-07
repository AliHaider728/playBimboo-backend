import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import Settings from '../models/Settings.js';
import { authenticateToken, requireSuperAdmin } from '../middleware/auth.js';
import {
  deleteCategoryImage,
  hasCloudinaryConfiguration,
  isCategoryImagePublicId
} from '../lib/cloudinary.js';

const router = Router();

const cleanText = (value: unknown, maxLength: number) =>
  String(value ?? '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);

const createSlug = (value: unknown) =>
  String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const optionalNumber = (value: unknown, field: string, maximum = 10_000_000) => {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > maximum) throw new Error(`${field} must be a non-negative number`);
  return number;
};

const normalizeCategoryPayload = (body: Record<string, any>, current?: Record<string, any>) => {
  const merged = { ...(current || {}), ...body };
  const name = cleanText(merged.name, 100);
  const slug = createSlug(merged.slug || name);
  if (!name) throw new Error('Category name is required');
  if (!slug) throw new Error('Category slug is required');
  const image = cleanText(merged.image, 500);
  const imagePublicId = cleanText(merged.imagePublicId, 200) || undefined;
  if (image) {
    try {
      if (new URL(image).protocol !== 'https:') throw new Error();
    } catch { throw new Error('Category images must use secure HTTPS URLs'); }
  }
  if (imagePublicId && (!isCategoryImagePublicId(imagePublicId) || !/^https:\/\/res\.cloudinary\.com\//i.test(image))) {
    throw new Error('Invalid PlayBimboo category image');
  }
  const parentCategoryId = cleanText(merged.parentCategoryId, 80) || undefined;
  return {
    name,
    slug,
    iconName: cleanText(merged.iconName, 50) || 'Boxes',
    image,
    imagePublicId,
    shortDescription: cleanText(merged.shortDescription ?? merged.description, 240),
    description: cleanText(merged.description, 2000) || undefined,
    deliveryCharge: optionalNumber(merged.deliveryCharge, 'Delivery charge'),
    isActive: merged.isActive !== false,
    isFeatured: merged.isFeatured === true,
    showInNavigation: merged.showInNavigation !== false,
    navigationLabel: cleanText(merged.navigationLabel, 50) || undefined,
    displayOrder: optionalNumber(merged.displayOrder, 'Display order', 10000) ?? 0,
    parentCategoryId,
    seoTitle: cleanText(merged.seoTitle, 70) || undefined,
    metaDescription: cleanText(merged.metaDescription, 180) || undefined,
    desktopVisible: merged.desktopVisible !== false,
    mobileVisible: merged.mobileVisible !== false
  };
};

const categoryProductFilter = (category: Record<string, any>) => ({
  $or: [
    { categoryIds: String(category._id) },
    { categorySlugs: category.slug },
    { categoryId: String(category._id) },
    { categorySlug: category.slug }
  ]
});

const readProductCategories = (
  product: Record<string, any>,
  legacyFallback?: { id: string; name: string; slug: string }
) => {
  const ids = Array.isArray(product.categoryIds) && product.categoryIds.length > 0
    ? product.categoryIds.map(String)
    : product.categoryId ? [String(product.categoryId)] : [];
  const names = Array.isArray(product.categoryNames) ? product.categoryNames : [];
  const slugs = Array.isArray(product.categorySlugs) ? product.categorySlugs : [];
  const resolved = ids.map((id, index) => ({
    id,
    name: String(names[index] || (index === 0 ? product.category : '') || ''),
    slug: String(slugs[index] || (index === 0 ? product.categorySlug : '') || '')
  }));
  if (resolved.length === 0 && legacyFallback && (product.category || product.categorySlug)) {
    resolved.push({
      id: legacyFallback.id,
      name: String(product.category || legacyFallback.name),
      slug: String(product.categorySlug || legacyFallback.slug)
    });
  }
  return resolved;
};

const categoryFields = (categories: Array<{ id: string; name: string; slug: string }>) => ({
  categoryIds: categories.map(category => category.id),
  categoryNames: categories.map(category => category.name),
  categorySlugs: categories.map(category => category.slug),
  categoryId: categories[0]?.id || '',
  category: categories[0]?.name || '',
  categorySlug: categories[0]?.slug || ''
});

const serializeCategories = async (categories: any[]) => Promise.all(categories.map(async category => {
  const value = typeof category.toObject === 'function' ? category.toObject() : { ...category };
  value.itemCount = await Product.countDocuments(categoryProductFilter(value));
  value.shortDescription = value.shortDescription || value.description || '';
  value.description = value.description || value.shortDescription || '';
  return value;
}));

const assertUniqueCategory = async (name: string, slug: string, excludedId?: string) => {
  const excluded = excludedId ? { _id: { $ne: excludedId } } : {};
  if (await Category.exists({ ...excluded, slug })) throw new Error('Category slug is already in use');
  if (await Category.exists({ ...excluded, name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } })) {
    throw new Error('Category name is already in use');
  }
};

const assertValidCategoryParent = async (parentCategoryId?: string, categoryId?: string) => {
  if (!parentCategoryId) return;
  if (parentCategoryId === categoryId) throw new Error('A category cannot be its own parent');
  const parent = await Category.findById(parentCategoryId).select('parentCategoryId').lean();
  if (!parent) throw new Error('Parent category was not found');
  if (parent.parentCategoryId) throw new Error('Category hierarchy supports only one child level');
  if (categoryId && await Category.exists({ parentCategoryId: categoryId })) {
    throw new Error('A category with children cannot become a child category');
  }
};

const deleteUnusedCategoryImage = async (publicId?: string) => {
  if (!publicId || !hasCloudinaryConfiguration) return;
  if (await Category.exists({ imagePublicId: publicId })) return;
  try { await deleteCategoryImage(publicId); } catch { console.error('Unused category image cleanup failed.'); }
};

router.get('/', async (_req: Request, res: Response) => {
  try {
    res.set('Cache-Control', 'no-store, max-age=0');
    const categories = await Category.find({ isActive: { $ne: false } }).sort({ displayOrder: 1, name: 1 });
    res.json(await serializeCategories(categories));
  } catch { res.status(500).json({ error: 'Could not load categories' }); }
});

router.get('/admin/all', authenticateToken, requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const categories = await Category.find().sort({ displayOrder: 1, name: 1 });
    res.json(await serializeCategories(categories));
  } catch { res.status(500).json({ error: 'Could not load categories' }); }
});

router.get('/:id/delete-impact', authenticateToken, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const category = await Category.findById(req.params.id).lean();
    if (!category) return res.status(404).json({ error: 'Category not found' });
    const settings = await Settings.findOne().lean();
    const affectedNavigation = (settings?.storefrontNavigation || [])
      .filter((item: any) => item.categoryId === String(category._id))
      .map((item: any) => ({ id: item.id, label: item.label }));
    res.json({
      productCount: await Product.countDocuments(categoryProductFilter(category)),
      navigationCount: affectedNavigation.length,
      navigationItems: affectedNavigation
    });
  } catch { res.status(400).json({ error: 'Could not inspect category references' }); }
});

router.post('/', authenticateToken, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const payload = normalizeCategoryPayload(req.body);
    await assertUniqueCategory(payload.name, payload.slug);
    await assertValidCategoryParent(payload.parentCategoryId);
    const category = await Category.create(payload);
    res.status(201).json((await serializeCategories([category]))[0]);
  } catch (error: any) {
    const conflict = error?.code === 11000 || /already in use/i.test(error?.message || '');
    res.status(conflict ? 409 : 400).json({ error: error instanceof Error ? error.message : 'Could not create category' });
  }
});

router.put('/:id', authenticateToken, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    const current = category.toObject();
    const payload = normalizeCategoryPayload(req.body, current);
    await assertValidCategoryParent(payload.parentCategoryId, category.id);
    await assertUniqueCategory(payload.name, payload.slug, category.id);
    const oldPublicId = category.imagePublicId;
    const oldSlug = category.slug;
    category.set(payload);
    await category.save();
    const affectedProducts = await Product.find(categoryProductFilter({ _id: category.id, slug: oldSlug }))
      .select('categoryId category categorySlug categoryIds categoryNames categorySlugs').lean();
    if (affectedProducts.length > 0) {
      await Product.bulkWrite(affectedProducts.map(product => ({
        updateOne: {
          filter: { _id: product._id },
          update: { $set: categoryFields(readProductCategories(product, {
            id: category.id,
            name: category.name,
            slug: oldSlug
          }).map(item =>
            item.id === category.id ? { id: category.id, name: category.name, slug: category.slug } : item
          )) }
        }
      })));
    }
    if (oldPublicId && oldPublicId !== category.imagePublicId) await deleteUnusedCategoryImage(oldPublicId);
    res.json((await serializeCategories([category]))[0]);
  } catch (error: any) {
    const conflict = error?.code === 11000 || /already in use/i.test(error?.message || '');
    res.status(conflict ? 409 : 400).json({ error: error instanceof Error ? error.message : 'Could not update category' });
  }
});

router.delete('/:id', authenticateToken, requireSuperAdmin, async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  let oldPublicId: string | undefined;
  try {
    const resolution = req.body?.resolution;
    const navigationResolution = req.body?.navigationResolution;
    const targetCategoryId = cleanText(req.body?.targetCategoryId, 80);
    let result = { productsReassigned: 0, navigationUpdated: 0 };
    await session.withTransaction(async () => {
      const category = await Category.findById(req.params.id).session(session);
      if (!category) throw new Error('Category not found');
      oldPublicId = category.imagePublicId;
      const productFilter = categoryProductFilter(category.toObject());
      const productCount = await Product.countDocuments(productFilter).session(session);
      const settings = await Settings.findOne().session(session);
      const affectedNav = (settings?.storefrontNavigation || []).filter((item: any) => item.categoryId === category.id);
      if (productCount > 0 && !['uncategorized', 'reassign'].includes(resolution)) {
        throw new Error('Choose how to reassign products before deleting this category');
      }
      if (affectedNav.length > 0 && !['remove', 'reassign'].includes(navigationResolution)) {
        throw new Error('Choose how to resolve navigation links before deleting this category');
      }
      let target: any;
      if (resolution === 'reassign' || navigationResolution === 'reassign') {
        if (!targetCategoryId || targetCategoryId === category.id) throw new Error('Choose another category for reassignment');
        target = await Category.findById(targetCategoryId).session(session);
        if (!target) throw new Error('Reassignment category was not found');
      }
      if (productCount > 0) {
        const affectedProducts = await Product.find(productFilter)
          .select('categoryId category categorySlug categoryIds categoryNames categorySlugs')
          .session(session).lean();
        const operations = affectedProducts.map(product => {
          const currentCategories = readProductCategories(product, {
            id: category.id,
            name: category.name,
            slug: category.slug
          });
          const nextCategories: Array<{ id: string; name: string; slug: string }> = [];
          for (const item of currentCategories) {
            const next = item.id === category.id
              ? resolution === 'reassign' ? { id: target.id, name: target.name, slug: target.slug } : undefined
              : item;
            if (next && !nextCategories.some(existing => existing.id === next.id)) nextCategories.push(next);
          }
          return { updateOne: { filter: { _id: product._id }, update: { $set: categoryFields(nextCategories) } } };
        });
        if (operations.length > 0) await Product.bulkWrite(operations, { session });
        result.productsReassigned = operations.length;
      }
      if (settings && affectedNav.length > 0) {
        if (navigationResolution === 'reassign') {
          settings.storefrontNavigation.forEach((item: any) => {
            if (item.categoryId === category.id) item.categoryId = target.id;
          });
        } else {
          const removedIds = new Set(affectedNav.map((item: any) => item.id));
          settings.storefrontNavigation = settings.storefrontNavigation.filter((item: any) =>
            !removedIds.has(item.id) && !removedIds.has(item.parentId)
          ) as any;
        }
        result.navigationUpdated = affectedNav.length;
        await settings.save({ session });
      }
      await category.deleteOne({ session });
    });
    await deleteUnusedCategoryImage(oldPublicId);
    res.json({ deleted: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not delete category';
    res.status(message === 'Category not found' ? 404 : 409).json({ error: message });
  } finally {
    await session.endSession();
  }
});

export default router;
