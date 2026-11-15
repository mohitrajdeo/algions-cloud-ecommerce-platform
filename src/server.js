import { app } from './app.js';

const PORT = process.env.PORT || 8080;

const server = app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🚀 ALGIONS E-Commerce Platform API Online`);
  console.log(`📦 Port: ${PORT}`);
  console.log(`🔍 Health Probe: http://localhost:${PORT}/healthz`);
  console.log(`🔍 Readiness Probe: http://localhost:${PORT}/readyz`);
  console.log(`📚 Products: http://localhost:${PORT}/api/products`);
  console.log(`===================================================`);
});

// Graceful shutdown handling for container termination (SIGTERM / SIGINT)
const gracefulShutdown = (signal) => {
  console.log(`[Lifecycle] Received ${signal}. Draining connections...`);
  server.close(() => {
    console.log('[Lifecycle] HTTP server closed gracefully. Exiting process.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[Lifecycle] Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
