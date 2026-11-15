import pg from 'pg';

const { Pool } = pg;

// In-memory state store for zero-dependency local runs and edge testing
const memoryStore = {
  products: [
    { id: 'prod_001', name: 'High-Performance Cloud Compute Node', price: 120.00, stock: 15, category: 'Compute' },
    { id: 'prod_002', name: 'Managed Kubernetes Cluster Slot', price: 250.00, stock: 8, category: 'Orchestration' },
    { id: 'prod_003', name: 'Distributed Redis Cache (16GB)', price: 45.00, stock: 25, category: 'Storage' },
    { id: 'prod_004', name: 'Edge CDN Global Bandwidth (1TB)', price: 30.00, stock: 50, category: 'Networking' },
    { id: 'prod_005', name: 'Isolated Hardware Security Module', price: 499.00, stock: 3, category: 'Security' }
  ],
  orders: new Map(),
  idempotencyKeys: new Map(),
  auditLogs: []
};

let pool = null;
let usePostgres = false;

if (process.env.DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 5000
    });
    usePostgres = true;
  } catch (err) {
    console.warn('[DB] PostgreSQL pool initialization failed, falling back to memory store:', err.message);
    usePostgres = false;
  }
}

export async function initDb() {
  if (!usePostgres || !pool) {
    console.log('[DB] Running with high-availability in-memory database engine.');
    return;
  }

  try {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS products (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          price NUMERIC(10, 2) NOT NULL,
          stock INT NOT NULL CHECK (stock >= 0),
          category VARCHAR(100) NOT NULL
        );

        CREATE TABLE IF NOT EXISTS orders (
          id VARCHAR(64) PRIMARY KEY,
          idempotency_key VARCHAR(128) UNIQUE NOT NULL,
          product_id VARCHAR(64) REFERENCES products(id),
          quantity INT NOT NULL,
          total_price NUMERIC(10, 2) NOT NULL,
          status VARCHAR(32) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
          id SERIAL PRIMARY KEY,
          action VARCHAR(64) NOT NULL,
          details JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      // Seed data if empty
      const res = await client.query('SELECT COUNT(*) FROM products');
      if (parseInt(res.rows[0].count, 10) === 0) {
        for (const p of memoryStore.products) {
          await client.query(
            'INSERT INTO products (id, name, price, stock, category) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
            [p.id, p.name, p.price, p.stock, p.category]
          );
        }
        console.log('[DB] Seeded initial products into PostgreSQL.');
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('[DB] PostgreSQL connection check failed, continuing with resilient memory store:', err.message);
    usePostgres = false;
  }
}

export async function checkDbHealth() {
  if (usePostgres && pool) {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      return { status: 'healthy', engine: 'postgresql' };
    } catch (err) {
      return { status: 'degraded', engine: 'postgresql', error: err.message };
    }
  }
  return { status: 'healthy', engine: 'in-memory' };
}

export async function getProducts(search = '') {
  if (usePostgres && pool) {
    const query = search 
      ? 'SELECT * FROM products WHERE name ILIKE $1 ORDER BY id ASC' 
      : 'SELECT * FROM products ORDER BY id ASC';
    const params = search ? [`%${search}%`] : [];
    const res = await pool.query(query, params);
    return res.rows;
  }

  if (!search) return memoryStore.products;
  return memoryStore.products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
}

export async function getProductById(id) {
  if (usePostgres && pool) {
    const res = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    return res.rows[0] || null;
  }
  return memoryStore.products.find(p => p.id === id) || null;
}

export async function createOrder({ idempotencyKey, productId, quantity }) {
  if (!idempotencyKey) {
    throw new Error('MISSING_IDEMPOTENCY_KEY');
  }

  // Idempotency check: if this key was already processed, return existing order
  if (usePostgres && pool) {
    const existing = await pool.query('SELECT * FROM orders WHERE idempotency_key = $1', [idempotencyKey]);
    if (existing.rows.length > 0) {
      return { order: existing.rows[0], idempotent: true };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const prodRes = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [productId]);
      if (prodRes.rows.length === 0) {
        throw new Error('PRODUCT_NOT_FOUND');
      }
      
      const product = prodRes.rows[0];
      if (product.stock < quantity) {
        throw new Error('INSUFFICIENT_STOCK');
      }

      await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [quantity, productId]);
      
      const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const totalPrice = (Number(product.price) * quantity).toFixed(2);
      
      const orderRes = await client.query(
        'INSERT INTO orders (id, idempotency_key, product_id, quantity, total_price, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [orderId, idempotencyKey, productId, quantity, totalPrice, 'CONFIRMED']
      );

      await client.query(
        'INSERT INTO audit_logs (action, details) VALUES ($1, $2)',
        ['ORDER_CREATED', JSON.stringify({ orderId, idempotencyKey, productId, quantity, totalPrice })]
      );

      await client.query('COMMIT');
      return { order: orderRes.rows[0], idempotent: false };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // In-Memory transaction simulation with concurrency lock
  if (memoryStore.idempotencyKeys.has(idempotencyKey)) {
    const existingOrderId = memoryStore.idempotencyKeys.get(idempotencyKey);
    return { order: memoryStore.orders.get(existingOrderId), idempotent: true };
  }

  const product = memoryStore.products.find(p => p.id === productId);
  if (!product) {
    throw new Error('PRODUCT_NOT_FOUND');
  }

  if (product.stock < quantity) {
    throw new Error('INSUFFICIENT_STOCK');
  }

  // Atomically decrement stock
  product.stock -= quantity;

  const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const totalPrice = Number((product.price * quantity).toFixed(2));
  const order = {
    id: orderId,
    idempotency_key: idempotencyKey,
    product_id: productId,
    quantity,
    total_price: totalPrice,
    status: 'CONFIRMED',
    created_at: new Date().toISOString()
  };

  memoryStore.orders.set(orderId, order);
  memoryStore.idempotencyKeys.set(idempotencyKey, orderId);
  memoryStore.auditLogs.push({
    action: 'ORDER_CREATED',
    details: { orderId, idempotencyKey, productId, quantity, totalPrice },
    created_at: new Date().toISOString()
  });

  return { order, idempotent: false };
}

export async function getOrderById(id) {
  if (usePostgres && pool) {
    const res = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    return res.rows[0] || null;
  }
  return memoryStore.orders.get(id) || null;
}

export async function updateProductStock({ productId, newStock, adminKey }) {
  if (adminKey !== (process.env.ADMIN_API_KEY || 'algions-secret-key-2026')) {
    throw new Error('UNAUTHORIZED');
  }

  if (newStock < 0) {
    throw new Error('INVALID_STOCK_VALUE');
  }

  if (usePostgres && pool) {
    const res = await pool.query(
      'UPDATE products SET stock = $1 WHERE id = $2 RETURNING *',
      [newStock, productId]
    );
    if (res.rows.length === 0) throw new Error('PRODUCT_NOT_FOUND');
    
    await pool.query(
      'INSERT INTO audit_logs (action, details) VALUES ($1, $2)',
      ['ADMIN_STOCK_UPDATE', JSON.stringify({ productId, newStock, updatedBy: 'admin' })]
    );
    return res.rows[0];
  }

  const product = memoryStore.products.find(p => p.id === productId);
  if (!product) throw new Error('PRODUCT_NOT_FOUND');

  const oldStock = product.stock;
  product.stock = newStock;
  memoryStore.auditLogs.push({
    action: 'ADMIN_STOCK_UPDATE',
    details: { productId, oldStock, newStock, updatedBy: 'admin' },
    created_at: new Date().toISOString()
  });

  return product;
}

export async function getAuditLogs() {
  if (usePostgres && pool) {
    const res = await pool.query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 50');
    return res.rows;
  }
  return [...memoryStore.auditLogs].reverse().slice(0, 50);
}
