import assert from 'node:assert/strict';
import test from 'node:test';

import { mapOrderForFrontend } from '../src/mysql-routes/orders.js';

test('mapOrderForFrontend produces the contract used by the admin orders list', () => {
  const mapped = mapOrderForFrontend({
    id: 'internal-order-id',
    orderId: 'PB-EXAMPLE-001',
    guestEmail: 'customer@example.com',
    guestPhone: '03001234567',
    total: '3499.00',
    subtotal: '3299.00',
    shippingFee: '200.00',
    discountAmount: '0.00',
    status: 'Processing',
    createdAt: '2026-08-23T09:15:00.000Z',
    shippingAddress: JSON.stringify({
      fullName: 'Example Customer',
      phone: '03001234567',
      street: '1 Test Street',
      city: 'Lahore'
    }),
    items: [{
      productId: 'product-1',
      productName: 'Wooden Activity Cube',
      quantity: 2,
      price: '1649.50',
      image: 'https://example.com/product.webp'
    }]
  });

  assert.equal(mapped.customerName, 'Example Customer');
  assert.equal(mapped.email, 'customer@example.com');
  assert.equal(mapped.phone, '03001234567');
  assert.equal(mapped.date, '2026-08-23');
  assert.equal(mapped.total, 3499);
  assert.equal(typeof mapped.total, 'number');
  assert.equal(mapped.status, 'Processing');
  assert.equal(mapped.items[0].name, 'Wooden Activity Cube');
  assert.equal(mapped.items[0].price, 1649.5);
  assert.equal(typeof mapped.items[0].price, 'number');
});
