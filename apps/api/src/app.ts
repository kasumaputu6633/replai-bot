import fastify from 'fastify';
import type { Logger } from 'pino';
import { registerHealthRoutes } from './routes/health.js';

export function buildApp(logger: Logger) {
  const app = fastify({ loggerInstance: logger });
  let initialized = false;

  void app.register(registerHealthRoutes, {
    isReady: () => initialized,
  });

  app.addHook('onReady', async () => {
    initialized = true;
  });

  app.addHook('onClose', async () => {
    initialized = false;
  });

  return app;
}
