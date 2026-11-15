// Lightweight native Prometheus metrics registry without heavy external dependencies

const requestCounts = {};
let ordersCreatedTotal = 0;
let idempotentHitsTotal = 0;
let stockRejectionsTotal = 0;
let adminUpdatesTotal = 0;

export function recordRequest(method, route, statusCode, durationMs) {
  const key = `${method}|${route}|${statusCode}`;
  requestCounts[key] = (requestCounts[key] || 0) + 1;
}

export function recordOrderCreated() {
  ordersCreatedTotal += 1;
}

export function recordIdempotentHit() {
  idempotentHitsTotal += 1;
}

export function recordStockRejection() {
  stockRejectionsTotal += 1;
}

export function recordAdminUpdate() {
  adminUpdatesTotal += 1;
}

export function getPrometheusMetrics() {
  const lines = [
    '# HELP http_requests_total Total number of HTTP requests made.',
    '# TYPE http_requests_total counter'
  ];

  for (const [key, count] of Object.entries(requestCounts)) {
    const [method, route, status] = key.split('|');
    lines.push(`http_requests_total{method="${method}",route="${route}",status="${status}"} ${count}`);
  }

  lines.push('');
  lines.push('# HELP ecommerce_orders_created_total Total successfully created orders.');
  lines.push('# TYPE ecommerce_orders_created_total counter');
  lines.push(`ecommerce_orders_created_total ${ordersCreatedTotal}`);

  lines.push('');
  lines.push('# HELP ecommerce_idempotent_hits_total Total duplicate order requests served from idempotency store.');
  lines.push('# TYPE ecommerce_idempotent_hits_total counter');
  lines.push(`ecommerce_idempotent_hits_total ${idempotentHitsTotal}`);

  lines.push('');
  lines.push('# HELP ecommerce_stock_rejections_total Total order requests rejected to prevent negative stock.');
  lines.push('# TYPE ecommerce_stock_rejections_total counter');
  lines.push(`ecommerce_stock_rejections_total ${stockRejectionsTotal}`);

  lines.push('');
  lines.push('# HELP ecommerce_admin_stock_updates_total Total administrative stock adjustments.');
  lines.push('# TYPE ecommerce_admin_stock_updates_total counter');
  lines.push(`ecommerce_admin_stock_updates_total ${adminUpdatesTotal}`);

  lines.push('');
  lines.push('# HELP process_uptime_seconds Process uptime in seconds.');
  lines.push('# TYPE process_uptime_seconds gauge');
  lines.push(`process_uptime_seconds ${Math.floor(process.uptime())}`);

  const mem = process.memoryUsage();
  lines.push('');
  lines.push('# HELP process_memory_heap_used_bytes Process heap memory used in bytes.');
  lines.push('# TYPE process_memory_heap_used_bytes gauge');
  lines.push(`process_memory_heap_used_bytes ${mem.heapUsed}`);

  return lines.join('\n') + '\n';
}
