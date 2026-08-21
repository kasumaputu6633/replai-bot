import pino, { type Logger, type LevelWithSilent } from 'pino';
import { z } from 'zod';

const commonSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

const botEnvironmentSchema = commonSchema.extend({
  DISCORD_TOKEN: z.string().trim().min(1, 'is required'),
  DISCORD_CLIENT_ID: z.string().trim().regex(/^\d+$/, 'must be a Discord snowflake'),
  AI_BASE_URL: z.url().refine((value) => value.startsWith('http://') || value.startsWith('https://'), {
    message: 'must use HTTP or HTTPS',
  }),
  AI_API_KEY: z.string().trim().min(1, 'is required'),
  AI_MODEL: z.string().trim().min(1, 'is required'),
  AI_WEB_SEARCH_MODEL: z.string().trim().min(1).default('exa'),
  AI_WEB_SEARCH_MAX_RESULTS: z.coerce.number().int().min(1).max(10).default(5),
  AI_WEB_FETCH_MODEL: z.string().trim().min(1).default('exa'),
});

const apiEnvironmentSchema = commonSchema.extend({
  API_HOST: z.string().trim().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
});

export interface CommonConfig {
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: LevelWithSilent;
}

export interface BotConfig extends CommonConfig {
  discordToken: string;
  discordClientId: string;
  ai: {
    baseUrl: string;
    apiKey: string;
    model: string;
    webSearchModel: string;
    webSearchMaxResults: number;
    webFetchModel: string;
  };
}

export interface ApiConfig extends CommonConfig {
  host: string;
  port: number;
}

function parseEnvironment<T>(schema: z.ZodType<T>): T {
  const result = schema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  return result.data;
}

export function loadBotConfig(): BotConfig {
  const environment = parseEnvironment(botEnvironmentSchema);

  return {
    nodeEnv: environment.NODE_ENV,
    logLevel: environment.LOG_LEVEL,
    discordToken: environment.DISCORD_TOKEN,
    discordClientId: environment.DISCORD_CLIENT_ID,
    ai: {
      baseUrl: environment.AI_BASE_URL,
      apiKey: environment.AI_API_KEY,
      model: environment.AI_MODEL,
      webSearchModel: environment.AI_WEB_SEARCH_MODEL,
      webSearchMaxResults: environment.AI_WEB_SEARCH_MAX_RESULTS,
      webFetchModel: environment.AI_WEB_FETCH_MODEL,
    },
  };
}

export function loadApiConfig(): ApiConfig {
  const environment = parseEnvironment(apiEnvironmentSchema);

  return {
    nodeEnv: environment.NODE_ENV,
    logLevel: environment.LOG_LEVEL,
    host: environment.API_HOST,
    port: environment.API_PORT,
  };
}

export function createLogger(service: string, level: LevelWithSilent): Logger {
  return pino({
    level,
    base: { service },
    redact: {
      paths: [
        'discordToken',
        'aiApiKey',
        'apiKey',
        'token',
        'authorization',
        'headers.authorization',
        'req.headers.authorization',
      ],
      censor: '[REDACTED]',
    },
  });
}
