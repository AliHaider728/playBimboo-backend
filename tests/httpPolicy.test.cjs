const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const { apiCors, noStore } = require('../dist/middleware/httpPolicy.js');

const app = express();
app.use(noStore);
app.use(apiCors);
app.use(express.json());
app.get('/api/live', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/failure', (_req, res) => res.status(503).json({ error: 'Database unavailable' }));

const server = app.listen(0, '127.0.0.1');
const ready = new Promise((resolve) => server.on('listening', () => {
  const address = server.address();
  resolve(`http://127.0.0.1:${address.port}`);
}));

test('HTTP policy across preflight, successful and failed requests', async (t) => {
  const base = await ready;
  t.after(() => server.close());
  for (const origin of ['https://playbimboo.com', 'https://www.playbimboo.com']) {
    const response = await fetch(`${base}/api/live`, {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization,content-type' }
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    assert.match(response.headers.get('vary') || '', /Origin/);
    assert.match(response.headers.get('cache-control') || '', /no-store/);
  }
  for (const route of ['/api/live', '/api/failure']) {
    const response = await fetch(`${base}${route}`, { headers: { Origin: 'https://playbimboo.com' } });
    assert.equal(response.status, route.endsWith('failure') ? 503 : 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://playbimboo.com');
    assert.equal(response.headers.get('x-litespeed-cache-control'), 'no-cache');
  }
  const denied = await fetch(`${base}/api/live`, {
    method: 'OPTIONS', headers: { Origin: 'https://untrusted.example', 'Access-Control-Request-Method': 'GET' }
  });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

