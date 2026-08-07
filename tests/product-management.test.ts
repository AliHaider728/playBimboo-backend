import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeAgeGroups,
  normalizeProductDetailBlocks,
  sanitizeAndScopeProductCss,
  sanitizeProductDescription,
  sanitizeProductDetailHtml
} from '../src/lib/productContent.js';
import { normalizeInventory } from '../src/lib/inventory.js';
import {
  DEFAULT_HOMEPAGE_SECTIONS,
  DEFAULT_STOREFRONT_NAVIGATION,
  validateAppearanceInput
} from '../src/config/storeAppearance.js';
import { authenticateIfPresent, requireAdmin, requireSuperAdmin } from '../src/middleware/auth.js';
import { requestChangesCustomCode } from '../src/routes/products.js';
import { serializeProduct } from '../src/routes/products.js';
import { validateItemStock } from '../src/routes/orders.js';
import Product from '../src/models/Product.js';

test('multi-age normalization supports legacy reads and canonical multi-select writes', () => {
  assert.deepEqual(normalizeAgeGroups(undefined, '3-5'), ['3-5']);
  assert.deepEqual(normalizeAgeGroups(undefined, '9-11'), ['9-12']);
  assert.deepEqual(normalizeAgeGroups(undefined, '8+'), ['9-12', '13+']);
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

test('full and escaped page documents are reduced to safe body fragments', () => {
  const fullDocument = '<!DOCTYPE html><html><head><style>body{display:none}</style><script>alert(1)</script></head><body><h2>Feature title</h2><p>Useful copy</p></body></html>';
  const normalized = sanitizeProductDescription(fullDocument);
  assert.equal(normalized, '<h2>Feature title</h2><p>Useful copy</p>');
  assert.equal(
    sanitizeProductDescription('&lt;!DOCTYPE html&gt;&lt;html&gt;&lt;body&gt;&lt;p&gt;Escaped copy&lt;/p&gt;&lt;/body&gt;&lt;/html&gt;'),
    '<p>Escaped copy</p>'
  );
});

test('inventory normalization resolves legacy contradictions without forcing untracked stock to zero', () => {
  assert.deepEqual(normalizeInventory({ stockQuantity: 9, inStock: false }), {
    trackInventory: true,
    stockQuantity: 9,
    stockStatus: 'in_stock',
    inStock: true,
    lowStockThreshold: undefined
  });
  assert.deepEqual(normalizeInventory({ trackInventory: false, stockStatus: 'in_stock' }), {
    trackInventory: false,
    stockStatus: 'in_stock',
    inStock: true
  });
});

test('variant inventory controls checkout without a stale parent override', () => {
  const product = {
    name: 'Variant toy',
    trackInventory: true,
    stockQuantity: 0,
    inStock: false,
    variants: [{
      name: 'Pieces',
      options: [{ name: '64 PCS', trackInventory: true, stockQuantity: 3, inStock: true }]
    }]
  };
  assert.doesNotThrow(() => validateItemStock(product, 2, 'Pieces: 64 PCS'));
  assert.throws(() => validateItemStock(product, 4, 'Pieces: 64 PCS'), /enough stock/i);
});

test('product API serialization preserves variation and default attribute maps', () => {
  const product = new Product({
    name: 'Variable toy',
    slug: 'variable-toy',
    price: 1000,
    images: ['https://example.com/toy.jpg'],
    imagePublicIds: [''],
    productType: 'variable',
    ageGroups: ['6-8'],
    attributes: [{
      source: 'custom', id: 'color', name: 'Color', slug: 'color', displayType: 'color_swatches',
      terms: [{ id: 'red', label: 'Red', slug: 'red', value: 'Red', colorValue: '#ef4444', position: 0 }],
      selectedTermIds: [], visible: true, usedForVariations: true, position: 0
    }],
    variations: [{
      id: 'variation-red', attributes: { color: 'Red' }, enabled: true, regularPrice: 1000,
      manageStock: false, stockStatus: 'in_stock'
    }],
    defaultAttributes: { color: 'Red' },
    defaultVariationId: 'variation-red'
  });

  const serialized = serializeProduct(product);
  assert.deepEqual(serialized.variations[0].attributes, { color: 'Red' });
  assert.deepEqual(serialized.defaultAttributes, { color: 'Red' });
  assert.equal(serialized.defaultVariationId, 'variation-red');
  assert.equal(serialized.attributes[0].terms[0].colorValue, '#ef4444');
});

test('product CSS is scoped and blocks global or external constructs', () => {
  const result = sanitizeAndScopeProductCss('.highlight { color: #e11d48; }', 'safe-product');
  assert.equal(result.raw, '.highlight { color: #e11d48; }');
  assert.match(result.scoped, /^\.product-custom-content\[data-product-slug="safe-product"\] \.highlight/);
  assert.throws(() => sanitizeAndScopeProductCss('body { display:none }', 'safe-product'), /not allowed|protected global/i);
  assert.throws(() => sanitizeAndScopeProductCss('.x { background:url(https://evil.example/x) }', 'safe-product'), /blocked construct/i);
  assert.throws(() => sanitizeAndScopeProductCss('@import "evil.css";', 'safe-product'), /blocked construct/i);
  assert.throws(() => sanitizeAndScopeProductCss('.x { position: fixed; z-index: 9999 }', 'safe-product'), /overlay layers/i);
});

test('detail image blocks require a dedicated PlayBimboo Cloudinary asset and alt text', () => {
  assert.throws(() => normalizeProductDetailBlocks([{
    id: 'image-1', type: 'image', enabled: true, order: 0,
    image: { secureUrl: 'https://res.cloudinary.com/demo/image/upload/example.jpg', publicId: 'playbimboo/products/not-detail', alt: 'Toy' }
  }]), /valid PlayBimboo Cloudinary/i);
  const normalized = normalizeProductDetailBlocks([{
    id: 'image-1', type: 'image', enabled: true, order: 0,
    image: { secureUrl: 'https://res.cloudinary.com/demo/image/upload/example.jpg', publicId: 'playbimboo/products/detail-content/example', alt: '' }
  }]);
  assert.equal(normalized[0].image?.alt, 'Product Image');
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

test('appearance validation supports safe custom links and one child level', () => {
  const parent = {
    id: 'nav-custom-parent', key: 'custom-parent', label: 'Explore', linkType: 'custom_internal_url',
    menuType: 'dropdown', parentId: null, visible: true, enabled: true, showOnDesktop: true,
    showOnMobile: true, displayOrder: 7, isSystemItem: false
  };
  const child = {
    id: 'nav-custom-child', key: 'custom-child', label: 'New Toys', linkType: 'custom_internal_url',
    menuType: 'link', path: '/category/all?sort=new', parentId: parent.id, visible: true, enabled: true,
    showOnDesktop: true, showOnMobile: true, displayOrder: 0, isSystemItem: false
  };
  const result = validateAppearanceInput({
    storefrontNavigation: [...DEFAULT_STOREFRONT_NAVIGATION, parent, child],
    homepageSections: DEFAULT_HOMEPAGE_SECTIONS
  });
  assert.equal(result.navigation.find(item => item.id === child.id)?.path, '/category/all?sort=new');
  assert.throws(() => validateAppearanceInput({
    storefrontNavigation: [...DEFAULT_STOREFRONT_NAVIGATION, { ...child, id: 'unsafe', key: 'unsafe', parentId: null, path: '/admin/users' }],
    homepageSections: DEFAULT_HOMEPAGE_SECTIONS
  }), /safe public paths/i);
  assert.throws(() => validateAppearanceInput({
    storefrontNavigation: [...DEFAULT_STOREFRONT_NAVIGATION, { ...child, id: 'external', key: 'external', parentId: null, linkType: 'external_url', path: undefined, externalUrl: 'javascript:alert(1)' }],
    homepageSections: DEFAULT_HOMEPAGE_SECTIONS
  }), /HTTPS URLs/i);
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

test('optional authentication leaves public reads anonymous when no token is sent', () => {
  let nextCalled = false;
  const request = { headers: {} } as any;
  authenticateIfPresent(request, {} as any, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(request.user, undefined);
});

test('normal product edits preserve existing custom code but cannot alter it', () => {
  const htmlBlock = { id: 'html-1', type: 'html', enabled: true, order: 1, content: '<p>Safe</p>', settings: { width: 'full', alignment: 'center' } };
  const current = { productDetailBlocks: [htmlBlock], productDetailCustomCss: '.safe { color: blue; }' };
  assert.equal(requestChangesCustomCode({ name: 'Updated name' }, current), false);
  assert.equal(requestChangesCustomCode({ productDetailBlocks: [htmlBlock] }, current), false);
  assert.equal(requestChangesCustomCode({ productDetailBlocks: [{ ...htmlBlock, content: '<p>Changed</p>' }] }, current), true);
  assert.equal(requestChangesCustomCode({ productDetailCustomCss: '.safe { color: red; }' }, current), true);
});
