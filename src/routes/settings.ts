import { Router, Request, Response } from 'express';
import Settings from '../models/Settings.js';
import Category from '../models/Category.js';
import { authenticateToken, requireAdmin, requireSuperAdmin } from '../middleware/auth.js';
import {
  DEFAULT_HOMEPAGE_SECTIONS,
  DEFAULT_STOREFRONT_NAVIGATION,
  normalizeStoredHomepageSections,
  normalizeStoredNavigation,
  validateAppearanceInput
} from '../config/storeAppearance.js';
import { migrateSettings } from '../lib/migrateSettings.js';

const router = Router();

const cleanText = (value: unknown, maxLength: number) =>
  String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

const finiteNumber = (value: unknown, field: string, maximum: number) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > maximum) {
    throw new Error(`${field} must be between 0 and ${maximum}`);
  }
  return number;
};

let migrationRun = false;

const getSettings = async () => {
  if (!migrationRun) {
    await migrateSettings();
    migrationRun = true;
  }
  let settings = await Settings.findOne();
  if (!settings) settings = await Settings.create({});
  return settings;
};

const resolvePublicNavigation = async (settings: any) => {
  const navigation = normalizeStoredNavigation(settings.storefrontNavigation);
  const categories = await Category.find({ isActive: { $ne: false } }).sort({ displayOrder: 1, name: 1 }).lean();
  const byId = new Map(categories.map(category => [String(category._id), category]));
  const resolved = navigation.flatMap(item => {
    if (item.linkType !== 'category') return [{ ...item }];
    const category = byId.get(String(item.categoryId || ''));
    if (!category) return [];
    return [{
      ...item,
      label: item.label || category.navigationLabel || category.name,
      path: `/category/${category.slug}`,
      visible: item.visible && category.isActive !== false && category.showInNavigation !== false,
      showOnDesktop: item.showOnDesktop && category.desktopVisible !== false,
      showOnMobile: item.showOnMobile && category.mobileVisible !== false
    }];
  });
  const categoryParent = resolved.find(item => item.key === 'categories' && item.menuType === 'dropdown');
  if (categoryParent) {
    const linkedIds = new Set(resolved.filter(item => item.parentId === categoryParent.id).map(item => item.categoryId));
    categories.filter(category => category.showInNavigation !== false && !linkedIds.has(String(category._id))).forEach((category, index) => {
      resolved.push({
        id: `nav-category-${category._id}`,
        key: `category-${category._id}`,
        label: category.navigationLabel || category.name,
        linkType: 'category',
        menuType: 'link',
        path: `/category/${category.slug}`,
        categoryId: String(category._id),
        parentId: categoryParent.id,
        visible: true,
        enabled: true,
        showOnDesktop: category.desktopVisible !== false,
        showOnMobile: category.mobileVisible !== false,
        displayOrder: 1000 + index,
        order: 1000 + index,
        isSystemItem: false
      });
    });
  }
  return resolved.map(({ isSystemItem: _internal, ...item }) => item);
};

const toPublicSettings = async (settings: any) => ({
  storeName: settings.storeName,
  email: settings.email,
  phone: settings.phone,
  address: settings.address,
  currency: settings.currency,
  freeShippingThreshold: settings.freeShippingThreshold,
  standardShippingFee: settings.standardShippingFee,
  taxRate: settings.taxRate,
  metaTitle: settings.defaultMetaTitle,
  metaDescription: settings.defaultMetaDescription,
  storefrontNavigation: await resolvePublicNavigation(settings),
  homepageSections: normalizeStoredHomepageSections(settings.homepageSections),
  socialLinks: {
    instagram: settings.socialLinks?.instagram || 'https://www.instagram.com/playbimbootoys',
    facebook: settings.socialLinks?.facebook || 'https://facebook.com/playbimbootoys',
    youtube: settings.socialLinks?.youtube || 'https://youtube.com/@playbimboo',
    tiktok: settings.socialLinks?.tiktok || 'https://tiktok.com/@playbimbootoys'
  }
});

// GET safe storefront settings (Public)
router.get('/', async (_req: Request, res: Response) => {
  try {
    res.set('Cache-Control', 'no-store, max-age=0');
    res.json(await toPublicSettings(await getSettings()));
  } catch {
    res.status(500).json({ error: 'Could not load store settings' });
  }
});

router.get('/appearance/admin', authenticateToken, requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const settings = await getSettings();
    res.json({
      ...(await toPublicSettings(settings)),
      storefrontNavigation: normalizeStoredNavigation(settings.storefrontNavigation)
    });
  } catch { res.status(500).json({ error: 'Could not load appearance settings' }); }
});

// PUT base store settings (Admin and Super Admin)
router.put('/', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const settings = await getSettings();
    const storeName = cleanText(req.body.storeName, 100);
    const email = cleanText(req.body.email, 160).toLowerCase();
    const phone = cleanText(req.body.phone, 60);
    const address = cleanText(req.body.address, 240);
    const currency = cleanText(req.body.currency, 12);
    const defaultMetaTitle = cleanText(req.body.metaTitle ?? req.body.defaultMetaTitle, 70);
    const defaultMetaDescription = cleanText(
      req.body.metaDescription ?? req.body.defaultMetaDescription,
      180
    );
    if (!storeName || !email || !phone || !address || !currency) {
      return res.status(400).json({ error: 'Complete all required store settings' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid support email address' });
    }
    settings.set({
      storeName,
      email,
      phone,
      address,
      currency,
      freeShippingThreshold: finiteNumber(req.body.freeShippingThreshold, 'Free shipping threshold', 10000000),
      standardShippingFee: finiteNumber(req.body.standardShippingFee, 'Standard shipping fee', 1000000),
      taxRate: finiteNumber(req.body.taxRate, 'Tax rate', 1),
      defaultMetaTitle,
      defaultMetaDescription
    });
    await settings.save();
    res.json(await toPublicSettings(settings));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid store settings' });
  }
});

// PUT storefront appearance (Super Admin only)
router.put('/appearance', authenticateToken, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const settings = await getSettings();
    const appearance = validateAppearanceInput(req.body);
    const categoryIds = [...new Set(appearance.navigation.map(item => item.categoryId).filter(Boolean))];
    if (categoryIds.length > 0 && await Category.countDocuments({ _id: { $in: categoryIds } }) !== categoryIds.length) {
      return res.status(400).json({ error: 'One or more navigation categories no longer exist' });
    }
    settings.storefrontNavigation = appearance.navigation;
    settings.homepageSections = appearance.homepageSections;
    await settings.save();
    res.json(await toPublicSettings(settings));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid appearance settings' });
  }
});

// POST reset storefront appearance defaults (Super Admin only)
router.post('/appearance/reset', authenticateToken, requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const settings = await getSettings();
    settings.storefrontNavigation = DEFAULT_STOREFRONT_NAVIGATION.map(item => ({ ...item }));
    settings.homepageSections = DEFAULT_HOMEPAGE_SECTIONS.map(item => ({ ...item }));
    await settings.save();
    res.json(await toPublicSettings(settings));
  } catch {
    res.status(500).json({ error: 'Could not reset storefront appearance' });
  }
});

export default router;
