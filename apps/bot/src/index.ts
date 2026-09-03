import { createLogger, loadBotConfig } from '@replai/config';
import { OpenAICompatibleResearchProvider } from '@replai/core';
import { Events } from 'discord.js';
import { AfkStateStore } from './afk/state-store.js';
import { AfkVoiceManager } from './afk/voice-manager.js';
import { createDiscordClient } from './client.js';
import { MongoStore } from './database/mongo-store.js';
import {
  registerAfkApplicationCommand,
  registerAfkInteractionHandler,
} from './commands/afk.js';
import { registerMessageCreateHandler } from './events/message-create.js';
import { ThreadMemoryStore } from './memory/thread-memory.js';

const config = loadBotConfig();
const logger = createLogger('replai-bot', config.logLevel);
const client = createDiscordClient();
const threadMemory = new ThreadMemoryStore();
let mongoStore: MongoStore | undefined;
if (config.mongodbUri) {
  try {
    mongoStore = await MongoStore.connect(config.mongodbUri, config.mongodbDatabase, logger);
    logger.info({ database: config.mongodbDatabase }, 'MongoDB connected');
    if (
      config.mongodbMigrationSourceUri &&
      config.mongodbMigrationSourceUri !== config.mongodbUri
    ) {
      const counts = await mongoStore.migrateFrom(
        config.mongodbMigrationSourceUri,
        config.mongodbDatabase,
      );
      logger.info(counts, 'MongoDB migration completed');
    }
  } catch (error) {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode =
      typeof error === 'object' && error && 'code' in error ? String(error.code) : undefined;
    logger.error(
      {
        errorName,
        errorMessage,
        errorCode,
      },
      `MongoDB unavailable (${errorName}${errorCode ? ` ${errorCode}` : ''}: ${errorMessage}); continuing with file AFK state`,
    );
  }
}
const afkState = await AfkStateStore.open(config.afkStatePath, mongoStore);
const afkVoice = new AfkVoiceManager(client, afkState, logger);
const provider = new OpenAICompatibleResearchProvider({
  apiKey: config.ai.apiKey,
  baseURL: config.ai.baseUrl,
  model: config.ai.model,
  publicModelName: config.ai.publicModelName,
  temperature: config.ai.temperature,
  ownerName: config.ai.ownerName,
  webApiKey: config.ai.webApiKey,
  webBaseURL: config.ai.webBaseUrl,
  webSearchModel: config.ai.webSearchModel,
  webSearchMaxResults: config.ai.webSearchMaxResults,
  webFetchModel: config.ai.webFetchModel,
});

// Web research silently disables itself when any credential is missing, which makes the
// bot answer verifiable questions from stale memory. Surface that at startup.
if (!config.ai.webBaseUrl || !config.ai.webApiKey || !config.ai.webSearchModel) {
  logger.warn(
    {
      hasWebBaseUrl: Boolean(config.ai.webBaseUrl),
      hasWebApiKey: Boolean(config.ai.webApiKey),
      hasWebSearchModel: Boolean(config.ai.webSearchModel),
      hasWebFetchModel: Boolean(config.ai.webFetchModel),
    },
    'Web search disabled; set WEB_BASE_URL, WEB_API_KEY, and AI_WEB_SEARCH_MODEL to verify factual claims',
  );
}

registerMessageCreateHandler({
  client,
  configuredClientId: config.discordClientId,
  provider,
  logger,
  model: config.ai.model,
  threadMemory,
  privilegedUserIds: new Set(config.privilegedUserIds),
  evaluationStore: mongoStore,
});
registerAfkInteractionHandler(client, afkVoice, logger);

let shutdownPromise: Promise<void> | undefined;

function shutdown(signal: string): Promise<void> {
  shutdownPromise ??= Promise.resolve().then(async () => {
    logger.info({ signal }, 'Shutting down Discord bot');
    afkVoice.shutdown();
    client.destroy();
    await mongoStore?.close();
  });
  return shutdownPromise;
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

client.once(Events.ClientReady, (readyClient) => {
  if (readyClient.user.id !== config.discordClientId) {
    logger.warn(
      { configuredClientId: config.discordClientId, actualClientId: readyClient.user.id },
      'DISCORD_CLIENT_ID does not match the authenticated bot',
    );
  }
  logger.info(
    { userId: readyClient.user.id, guildCount: readyClient.guilds.cache.size },
    'Discord bot connected',
  );
  void Promise.all([
    registerAfkApplicationCommand(readyClient, logger),
    afkVoice.restore(),
  ]).catch((error: unknown) => {
    logger.error({ err: error }, 'Failed to initialize AFK features');
  });
});

try {
  await client.login(config.discordToken);
} catch (error) {
  logger.fatal({ err: error }, 'Failed to connect Discord bot');
  process.exitCode = 1;
  await shutdown('startup-error');
}
