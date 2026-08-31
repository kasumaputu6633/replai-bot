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
    expect(loadBotConfig().afkStatePath).toBe('data/afk-guilds.json');
  });

  it('accepts a Railway volume path for persistent AFK state', () => {
    vi.stubEnv('DISCORD_TOKEN', 'discord-token');
    vi.stubEnv('DISCORD_CLIENT_ID', '123456789');
    vi.stubEnv('AFK_STATE_PATH', '/app/data/afk-guilds.json');
    vi.stubEnv('AI_BASE_URL', 'https://gateway.example/v1');
    vi.stubEnv('AI_API_KEY', 'api-key');
    vi.stubEnv('AI_MODEL', 'provider-model');

    expect(loadBotConfig().afkStatePath).toBe('/app/data/afk-guilds.json');
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

  it('keeps xAI chat credentials separate from optional web tools', () => {
    vi.stubEnv('DISCORD_TOKEN', 'discord-token');
    vi.stubEnv('DISCORD_CLIENT_ID', '123456789');
    vi.stubEnv('AI_BASE_URL', 'https://api.x.ai/v1');
    vi.stubEnv('AI_API_KEY', 'xai-key');
    vi.stubEnv('AI_MODEL', 'grok-4');
    vi.stubEnv('WEB_BASE_URL', 'https://web.example/v1');
    vi.stubEnv('WEB_API_KEY', 'web-key');
    vi.stubEnv('AI_WEB_SEARCH_MODEL', 'exa');
    vi.stubEnv('AI_WEB_FETCH_MODEL', 'exa');

    expect(loadBotConfig().ai).toMatchObject({
      baseUrl: 'https://api.x.ai/v1',
      apiKey: 'xai-key',
      model: 'grok-4',
      webBaseUrl: 'https://web.example/v1',
      webApiKey: 'web-key',
      webSearchModel: 'exa',
      webFetchModel: 'exa',
    });
  });
});
