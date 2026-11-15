import express from 'express';
import {
  initDb,
  checkDbHealth,
  getProducts,
  getProductById,
  createOrder,
  getOrderById,
  updateProductStock,
  getAuditLogs
} from './db.js';

export const app = express();
app.use(express.json());

// Structured request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
      userAgent: req.headers['user-agent'] || 'unknown'
    }));
  });
  next();
});

// Root welcome & platform info
app.get('/', (req, res) => {
  res.json({
    platform: 'ALGIONS E-Commerce Cloud Platform',
    assignment: 'TC.44069.2027.64876',
    author: 'Mohit Raj Deo (12323329)',
    version: '1.0.0',
    status: 'OPERATIONAL',
    probes: {
      liveness: '/healthz',
      readiness: '/readyz'
    },
    documentation: 'https://github.com/mohitrajdeo/algions-cloud-ecommerce-platform'
  });
});

// Liveness probe (Kubernetes / Docker health check)
app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    service: 'ecommerce-api'
  });
});

// Readiness probe (Database connectivity check)
app.get('/readyz', async (req, res) => {
  const dbHealth = await checkDbHealth();
  const isReady = dbHealth.status === 'healthy';

  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    database: dbHealth
  });
});

// Catalog: List all products or search
app.get('/api/products', async (req, res) => {
  try {
    const search = req.query.q || '';
    const products = await getProducts(search);
    res.json({
      success: true,
      count: products.length,
      products
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Catalog: Get single product
app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await getProductById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Order Processing: Idempotent checkout preventing duplicate charges & negative stock
app.post('/api/orders', async (req, res) => {
  const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotency_key;
  const { productId, quantity } = req.body;

  if (!idempotencyKey) {
    return res.status(400).json({
      success: false,
      error: 'Missing required header: Idempotency-Key. Required to guarantee zero duplicate orders.'
    });
  }

  if (!productId || typeof quantity !== 'number' || quantity <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid order parameters: productId and a positive integer quantity are required.'
    });
  }

  try {
    const result = await createOrder({ idempotencyKey, productId, quantity });
    const statusCode = result.idempotent ? 200 : 201;

    res.status(statusCode).json({
      success: true,
      idempotentReplay: result.idempotent,
      message: result.idempotent ? 'Returning existing order for key.' : 'Order confirmed and inventory deducted.',
      order: result.order
    });
  } catch (err) {
    if (err.message === 'PRODUCT_NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'Product not found.' });
    }
    if (err.message === 'INSUFFICIENT_STOCK') {
      return res.status(409).json({
        success: false,
        error: 'Order rejected: Insufficient stock. Negative inventory is strictly prohibited.'
      });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// Order status by ID
app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin stock adjustment with audit logging
app.post('/api/admin/products/:id/stock', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  const { stock } = req.body;

  if (!adminKey) {
    return res.status(401).json({ success: false, error: 'Missing x-admin-key header' });
  }

  if (typeof stock !== 'number' || stock < 0) {
    return res.status(400).json({ success: false, error: 'Stock must be a non-negative integer' });
  }

  try {
    const updated = await updateProductStock({
      productId: req.params.id,
      newStock: stock,
      adminKey
    });
    res.json({ success: true, product: updated });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') {
      return res.status(403).json({ success: false, error: 'Forbidden: Invalid admin authorization key' });
    }
    if (err.message === 'PRODUCT_NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// Audit logs
app.get('/api/admin/audit-logs', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== (process.env.ADMIN_API_KEY || 'algions-secret-key-2026')) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  try {
    const logs = await getAuditLogs();
    res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Initialize database on startup
initDb().catch(err => console.error('[DB Init Error]', err));
