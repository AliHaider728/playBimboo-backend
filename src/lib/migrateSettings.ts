/**
 * migrateSettings.ts
 * Runs once on startup to patch the live MongoDB Settings document if it
 * still contains old / wrong contact data that was stored before the
 * canonical business details were established.
 *
 * This is safe to call multiple times — it only writes if a change is needed.
 */
import Settings from '../models/Settings.js';

const CANONICAL = {
  storeName: 'PlayBimboo',
  email: 'Sales@playbimboo.com',
  phone: '0310-7172222',
  address: 'Mumtaz Market, Gujranwala',
  socialLinks: {
    instagram: 'https://www.instagram.com/playbimbootoys',
    facebook: 'https://facebook.com/playbimbootoys',
    youtube: 'https://youtube.com/@playbimboo',
    tiktok: 'https://tiktok.com/@playbimbootoys',
  },
};

// Values that mark a settings record as containing old/wrong data
const STALE_MARKERS = [
  'Gulberg',
  'Lahore',
  'support@playbimboo',
  '+92 300',
  '923001234567',
  '+327',
  'Shafique Center',
];

const isStale = (value: string) =>
  STALE_MARKERS.some((marker) => value.includes(marker));

export async function migrateSettings(): Promise<void> {
  try {
    let doc = await Settings.findOne();
    if (!doc) {
      // No settings doc yet — create with canonical values
      await Settings.create({
        ...CANONICAL,
        currency: 'Rs.',
        freeShippingThreshold: 5000,
        standardShippingFee: 200,
        taxRate: 0,
      });
      console.log('[migrateSettings] Created fresh Settings document with canonical data.');
      return;
    }

    let dirty = false;

    if (isStale(doc.email) || !doc.email) {
      console.log(`[migrateSettings] Patching email: "${doc.email}" -> "${CANONICAL.email}"`);
      doc.email = CANONICAL.email;
      dirty = true;
    }
    if (isStale(doc.phone) || !doc.phone) {
      console.log(`[migrateSettings] Patching phone: "${doc.phone}" -> "${CANONICAL.phone}"`);
      doc.phone = CANONICAL.phone;
      dirty = true;
    }
    if (isStale(doc.address) || !doc.address) {
      console.log(`[migrateSettings] Patching address: "${doc.address}" -> "${CANONICAL.address}"`);
      doc.address = CANONICAL.address;
      dirty = true;
    }

    // Patch social links if any are missing or stale
    const sl = doc.socialLinks || {};
    const patchedSocials = {
      instagram: sl.instagram || CANONICAL.socialLinks.instagram,
      facebook: sl.facebook || CANONICAL.socialLinks.facebook,
      youtube: sl.youtube || CANONICAL.socialLinks.youtube,
      tiktok: sl.tiktok || CANONICAL.socialLinks.tiktok,
    };
    const socialChanged = JSON.stringify(sl) !== JSON.stringify(patchedSocials);
    if (socialChanged) {
      console.log('[migrateSettings] Patching socialLinks.');
      doc.socialLinks = patchedSocials;
      dirty = true;
    }

    if (dirty) {
      await doc.save();
      console.log('[migrateSettings] Settings document updated with canonical data.');
    } else {
      console.log('[migrateSettings] Settings document is already canonical — no changes needed.');
    }
  } catch (err) {
    // Non-fatal: log but don't crash the server
    console.error('[migrateSettings] Could not run settings migration:', err);
  }
}
