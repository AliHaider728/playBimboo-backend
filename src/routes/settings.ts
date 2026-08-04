import { Router, Request, Response } from 'express';
import Settings from '../models/Settings.js';
import { authenticateToken, requireAdmin, requireSuperAdmin } from '../middleware/auth.js';
import {
  DEFAULT_HOMEPAGE_SECTIONS,
  DEFAULT_STOREFRONT_NAVIGATION,
  normalizeStoredHomepageSections,
  normalizeStoredNavigation,
  validateAppearanceInput
} from '../config/storeAppearance.js';

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

const getSettings = async () => {
  let settings = await Settings.findOne();
  if (!settings) settings = await Settings.create({});
  return settings;
};

const toPublicSettings = (settings: any) => ({
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
  storefrontNavigation: normalizeStoredNavigation(settings.storefrontNavigation),
  homepageSections: normalizeStoredHomepageSections(settings.homepageSections)
});

// GET safe storefront settings (Public)
router.get('/', async (_req: Request, res: Response) => {
  try {
    res.json(toPublicSettings(await getSettings()));
  } catch {
    res.status(500).json({ error: 'Could not load store settings' });
  }
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
    res.json(toPublicSettings(settings));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid store settings' });
  }
});

// PUT storefront appearance (Super Admin only)
router.put('/appearance', authenticateToken, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const settings = await getSettings();
    const appearance = validateAppearanceInput(req.body);
    settings.storefrontNavigation = appearance.navigation;
    settings.homepageSections = appearance.homepageSections;
    await settings.save();
    res.json(toPublicSettings(settings));
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
    res.json(toPublicSettings(settings));
  } catch {
    res.status(500).json({ error: 'Could not reset storefront appearance' });
  }
});

export default router;
