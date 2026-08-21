import pino from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const apps = new Set<ReturnType<typeof buildApp>>();

afterEach(async () => {
  await Promise.all([...apps].map((app) => app.close()));
  apps.clear();
});

describe('health routes', () => {
  it('reports liveness', async () => {
    const app = buildApp(pino({ level: 'silent' }));
    apps.add(app);
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'replai-api' });
  });

  it('reports readiness after initialization', async () => {
    const app = buildApp(pino({ level: 'silent' }));
    apps.add(app);
    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'replai-api' });
  });
});
