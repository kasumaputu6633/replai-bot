import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBotConfig } from './index.js';

describe('loadBotConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts blank optional personality controls', () => {
    vi.stubEnv('DISCORD_TOKEN', 'discord-token');
    vi.stubEnv('DISCORD_CLIENT_ID', '123456789');
    vi.stubEnv('AI_BASE_URL', 'https://gateway.example/v1');
    vi.stubEnv('AI_API_KEY', 'api-key');
    vi.stubEnv('AI_MODEL', 'provider-model');
    vi.stubEnv('AI_PUBLIC_MODEL_NAME', '');
    vi.stubEnv('AI_TEMPERATURE', '');
    vi.stubEnv('BOT_OWNER_NAME', 'Nando Ganteng');

    expect(loadBotConfig().ai).toMatchObject({
      model: 'provider-model',
      publicModelName: undefined,
      temperature: undefined,
      ownerName: 'Nando Ganteng',
    });
  });

  it('parses configured public identity and temperature', () => {
    vi.stubEnv('DISCORD_TOKEN', 'discord-token');
    vi.stubEnv('DISCORD_CLIENT_ID', '123456789');
    vi.stubEnv('AI_BASE_URL', 'https://gateway.example/v1');
    vi.stubEnv('AI_API_KEY', 'api-key');
    vi.stubEnv('AI_MODEL', 'provider-model');
    vi.stubEnv('AI_PUBLIC_MODEL_NAME', 'Ox Alpha');
    vi.stubEnv('AI_TEMPERATURE', '0.85');
    vi.stubEnv('BOT_OWNER_NAME', 'Nando Ganteng');

    expect(loadBotConfig().ai).toMatchObject({
      publicModelName: 'Ox Alpha',
      temperature: 0.85,
      ownerName: 'Nando Ganteng',
    });
  });
});
