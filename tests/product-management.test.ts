import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeAgeGroups,
  normalizeProductDetailBlocks,
  sanitizeAndScopeProductCss,
  sanitizeProductDetailHtml
} from '../src/lib/productContent.js';
import {
  DEFAULT_HOMEPAGE_SECTIONS,
  DEFAULT_STOREFRONT_NAVIGATION,
  validateAppearanceInput
} from '../src/config/storeAppearance.js';
import { requireAdmin, requireSuperAdmin } from '../src/middleware/auth.js';
import { requestChangesCustomCode } from '../src/routes/products.js';

test('multi-age normalization supports legacy reads and canonical multi-select writes', () => {
  assert.deepEqual(normalizeAgeGroups(undefined, '3-5'), ['3-5']);
  assert.deepEqual(normalizeAgeGroups(undefined, '9-11'), ['8+']);
  assert.deepEqual(normalizeAgeGroups(['0-2', '6-8']), ['0-2', '6-8']);
  assert.throws(() => normalizeAgeGroups([]), /at least one/i);
  assert.throws(() => normalizeAgeGroups(['3-5', '3-5']), /duplicates/i);
  assert.throws(() => normalizeAgeGroups(['adult']), /not supported/i);
});

test('product HTML sanitizer removes executable and remote-image content', () => {
  const result = sanitizeProductDetailHtml(`
    <script>alert(1)</script><form><input></form>
    <h2 onclick="alert(1)">Safe title</h2>
    <img src="https://evil.example/image.jpg" onerror="alert(1)">
    <table><tr><td>Safe table</td></tr></table>
  `);
  assert.doesNotMatch(result, /script|onclick|onerror|form|input|evil\.example/i);
  assert.match(result, /Safe title/);
  assert.match(result, /Safe table/);
});

test('product CSS is scoped and blocks global or external constructs', () => {
  const result = sanitizeAndScopeProductCss('.highlight { color: #e11d48; }', 'safe-product');
  assert.equal(result.raw, '.highlight { color: #e11d48; }');
  assert.match(result.scoped, /^\.product-custom-content\[data-product-slug="safe-product"\] \.highlight/);
  assert.throws(() => sanitizeAndScopeProductCss('body { display:none }', 'safe-product'), /protected global/i);
  assert.throws(() => sanitizeAndScopeProductCss('.x { background:url(https://evil.example/x) }', 'safe-product'), /blocked construct/i);
  assert.throws(() => sanitizeAndScopeProductCss('@import "evil.css";', 'safe-product'), /blocked construct/i);
  assert.throws(() => sanitizeAndScopeProductCss('.x { position: fixed; z-index: 9999 }', 'safe-product'), /overlay layers/i);
});

test('detail image blocks require a dedicated PlayBimboo Cloudinary asset and alt text', () => {
  assert.throws(() => normalizeProductDetailBlocks([{
    id: 'image-1', type: 'image', enabled: true, order: 0,
    image: { secureUrl: 'https://res.cloudinary.com/demo/image/upload/example.jpg', publicId: 'playbimboo/products/not-detail', alt: 'Toy' }
  }]), /valid PlayBimboo Cloudinary/i);
  assert.throws(() => normalizeProductDetailBlocks([{
    id: 'image-1', type: 'image', enabled: true, order: 0,
    image: { secureUrl: 'https://res.cloudinary.com/demo/image/upload/example.jpg', publicId: 'playbimboo/products/detail-content/example', alt: '' }
  }]), /alt text/i);
});

test('appearance validation keeps stable keys and protected routes', () => {
  const result = validateAppearanceInput({
    storefrontNavigation: DEFAULT_STOREFRONT_NAVIGATION.map(item => ({
      ...item,
      label: item.key === 'home' ? '<b>Start</b>' : item.label,
      path: '/attempted-override'
    })),
    homepageSections: DEFAULT_HOMEPAGE_SECTIONS.map(item => ({ ...item }))
  });
  assert.equal(result.navigation.find(item => item.key === 'home')?.label, 'Start');
  assert.equal(result.navigation.find(item => item.key === 'home')?.path, '/');
  assert.throws(() => validateAppearanceInput({
    storefrontNavigation: DEFAULT_STOREFRONT_NAVIGATION.slice(1),
    homepageSections: DEFAULT_HOMEPAGE_SECTIONS
  }), /every stable key/i);
});

const authorizationResult = (middleware: typeof requireAdmin, role?: string) => {
  let status = 200;
  let nextCalled = false;
  const request = { user: role ? { userId: '1', email: 'admin@example.com', role } : undefined } as any;
  const response = {
    status(code: number) { status = code; return this; },
    json() { return this; }
  } as any;
  middleware(request, response, () => { nextCalled = true; });
  return { status, nextCalled };
};

test('admin and super-admin authorization remain separated', () => {
  assert.equal(authorizationResult(requireAdmin, 'admin').nextCalled, true);
  assert.equal(authorizationResult(requireAdmin, 'super_admin').nextCalled, true);
  assert.equal(authorizationResult(requireSuperAdmin, 'admin').status, 403);
  assert.equal(authorizationResult(requireSuperAdmin, 'super_admin').nextCalled, true);
});

test('normal product edits preserve existing custom code but cannot alter it', () => {
  const htmlBlock = { id: 'html-1', type: 'html', enabled: true, order: 1, content: '<p>Safe</p>', settings: { width: 'full', alignment: 'center' } };
  const current = { productDetailBlocks: [htmlBlock], productDetailCustomCss: '.safe { color: blue; }' };
  assert.equal(requestChangesCustomCode({ name: 'Updated name' }, current), false);
  assert.equal(requestChangesCustomCode({ productDetailBlocks: [htmlBlock] }, current), false);
  assert.equal(requestChangesCustomCode({ productDetailBlocks: [{ ...htmlBlock, content: '<p>Changed</p>' }] }, current), true);
  assert.equal(requestChangesCustomCode({ productDetailCustomCss: '.safe { color: red; }' }, current), true);
});
