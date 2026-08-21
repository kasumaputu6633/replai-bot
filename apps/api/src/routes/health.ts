import type { FastifyInstance } from 'fastify';

export interface HealthRouteOptions {
  isReady: () => boolean;
}

export async function registerHealthRoutes(
  app: FastifyInstance,
  options: HealthRouteOptions,
): Promise<void> {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'replai-api',
  }));

  app.get('/ready', async (_request, reply) => {
    if (!options.isReady()) {
      return reply.code(503).send({
        status: 'not_ready',
        service: 'replai-api',
      });
    }

    return {
      status: 'ok',
      service: 'replai-api',
    };
  });
}
