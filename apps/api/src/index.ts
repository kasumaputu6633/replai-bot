import { createLogger, loadApiConfig } from '@replai/config';
import { buildApp } from './app.js';

const config = loadApiConfig();
const logger = createLogger('replai-api', config.logLevel);
const app = buildApp(logger);

let shutdownPromise: Promise<void> | undefined;

function shutdown(signal: string): Promise<void> {
  shutdownPromise ??= (async () => {
    logger.info({ signal }, 'Shutting down API');
    await app.close();
  })();
  return shutdownPromise;
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: config.host, port: config.port });
  logger.info({ host: config.host, port: config.port }, 'API listening');
} catch (error) {
  logger.fatal({ err: error }, 'Failed to start API');
  process.exitCode = 1;
  await shutdown('startup-error');
}
