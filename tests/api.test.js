import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import http from 'node:http';

// Test runner helper using native http client
function makeRequest({ method, path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      const payload = body ? JSON.stringify(body) : null;
      const reqHeaders = {
        'content-type': 'application/json',
        ...headers
      };
      if (payload) {
        reqHeaders['content-length'] = Buffer.byteLength(payload);
      }

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers: reqHeaders
        },
        (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            server.close();
            try {
              resolve({
                status: res.statusCode,
                headers: res.headers,
                body: data ? JSON.parse(data) : null
              });
            } catch (e) {
              resolve({ status: res.statusCode, headers: res.headers, body: data });
            }
          });
        }
      );

      req.on('error', err => {
        server.close();
        reject(err);
      });

      if (payload) req.write(payload);
      req.end();
    });
  });
}

test('1. Liveness Probe (/healthz) returns 200 OK', async () => {
  const res = await makeRequest({ method: 'GET', path: '/healthz' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'healthy');
  assert.equal(res.body.service, 'ecommerce-api');
});

test('2. Readiness Probe (/readyz) returns 200 OK with database health', async () => {
  const res = await makeRequest({ method: 'GET', path: '/readyz' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ready');
  assert.ok(res.body.database);
});

test('3. Product Catalog returns seed products', async () => {
  const res = await makeRequest({ method: 'GET', path: '/api/products' });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.products));
  assert.ok(res.body.products.length >= 5);
});

test('4. Order Creation succeeds and decrements stock', async () => {
  const idempotencyKey = `idem_test_${Date.now()}`;
  const res = await makeRequest({
    method: 'POST',
    path: '/api/orders',
    headers: { 'idempotency-key': idempotencyKey },
    body: { productId: 'prod_001', quantity: 2 }
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.idempotentReplay, false);
  assert.equal(res.body.order.product_id, 'prod_001');
  assert.equal(res.body.order.quantity, 2);
});

test('5. Idempotent Retry: Same Idempotency-Key returns existing order and does NOT double-deduct', async () => {
  const idempotencyKey = `idem_replay_${Date.now()}`;
  
  // First attempt
  const res1 = await makeRequest({
    method: 'POST',
    path: '/api/orders',
    headers: { 'idempotency-key': idempotencyKey },
    body: { productId: 'prod_003', quantity: 3 }
  });
  assert.equal(res1.status, 201);
  const orderId1 = res1.body.order.id;

  // Immediate retry with exact same key
  const res2 = await makeRequest({
    method: 'POST',
    path: '/api/orders',
    headers: { 'idempotency-key': idempotencyKey },
    body: { productId: 'prod_003', quantity: 3 }
  });

  assert.equal(res2.status, 200);
  assert.equal(res2.body.idempotentReplay, true);
  assert.equal(res2.body.order.id, orderId1);
  assert.equal(res2.body.order.quantity, 3);
});

test('6. Negative Stock Prevention: Order exceeding available stock is rejected with 409 Conflict', async () => {
  const res = await makeRequest({
    method: 'POST',
    path: '/api/orders',
    headers: { 'idempotency-key': `idem_overlimit_${Date.now()}` },
    body: { productId: 'prod_005', quantity: 9999 }
  });

  assert.equal(res.status, 409);
  assert.equal(res.body.success, false);
  assert.match(res.body.error, /Insufficient stock/i);
});

test('7. Missing Idempotency-Key returns 400 Bad Request', async () => {
  const res = await makeRequest({
    method: 'POST',
    path: '/api/orders',
    body: { productId: 'prod_001', quantity: 1 }
  });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /Idempotency-Key/i);
});
