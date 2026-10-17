import { app } from './app.js';
import { env } from './config/env.js';
import { closePool } from './platform/database/pool.js';

const server = app.listen(env.PORT, () => {
  console.log(`[ManageX Backend] HTTP server listening on port ${env.PORT} in ${env.NODE_ENV} mode`);
});

// Graceful shutdown handling
function handleShutdown(signal) {
  console.log(`[ManageX Backend] Received ${signal}. Closing HTTP server gracefully...`);
  server.close(async () => {
    try {
      await closePool();
    } catch (err) {
      console.error('[ManageX Backend] Error closing database pool:', err);
    }
    console.log('[ManageX Backend] Server and database resources closed cleanly.');
    process.exit(0);
  });

  // Force close after 10s if hanging
  setTimeout(() => {
    console.error('[ManageX Backend] Forced shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

