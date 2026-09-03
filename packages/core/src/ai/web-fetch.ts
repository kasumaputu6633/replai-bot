import { z } from 'zod';
import { ResearchProviderError } from '../errors/index.js';
import type { WebFetchResult } from './types.js';

export const MAX_WEB_FETCH_URLS = 2;
export const MAX_WEB_FETCH_CHARACTERS = 6_000;

const WEB_FETCH_TIMEOUT_MS = 20_000;
/**
 * Hosts whose pages may be fetched in full.
 *
 * Social platforms are included because a shared post is often the claim itself.
 * Developer documentation and source hosts are included because capability
 * questions are only answerable against current primary docs.
 */
const ALLOWED_WEB_FETCH_HOSTS = [
  'developer.mozilla.org',
  'discord.com',
  'discord.dev',
  'discordjs.dev',
  'discordjs.guide',
  'docs.python.org',
  'facebook.com',
  'github.com',
  'github.io',
  'gitlab.com',
  'instagram.com',
  'npmjs.com',
  'pypi.org',
  'readthedocs.io',
  'redd.it',
  'reddit.com',
  'stackoverflow.com',
  'threads.net',
  'tiktok.com',
  'twitter.com',
  'x.com',
  'youtu.be',
  'youtube.com',
] as const;

const webFetchResponseSchema = z.object({
  url: z.url(),
  title: z.string().catch(''),
  content: z.object({
    text: z.string(),
  }),
  metadata: z
    .object({
      author: z.string().nullish(),
      published_at: z.string().nullish(),
    })
    .optional(),
});

export interface NineRouterWebFetchConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  fetchImplementation?: typeof fetch | undefined;
}

export function isAllowedWebFetchUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const allowedHost = ALLOWED_WEB_FETCH_HOSTS.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    );

    return (
      allowedHost &&
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '80' || url.port === '443')
    );
  } catch {
    return false;
  }
}

export class NineRouterWebFetchClient {
  readonly #apiKey: string;
  readonly #endpoint: string;
  readonly #fetch: typeof fetch;
  readonly #model: string;

  public constructor(config: NineRouterWebFetchConfig) {
    this.#apiKey = config.apiKey;
    this.#endpoint = `${config.baseURL.replace(/\/+$/u, '')}/web/fetch`;
    this.#fetch = config.fetchImplementation ?? fetch;
    this.#model = config.model.endsWith('/fetch')
      ? config.model.slice(0, -'/fetch'.length)
      : config.model;
  }

  public async fetch(url: string): Promise<WebFetchResult> {
    if (!isAllowedWebFetchUrl(url)) {
      throw new ResearchProviderError('URL is not allowed for web fetching.');
    }

    const response = await this.#fetch(this.#endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.#apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Replai/0.1.0',
      },
      body: JSON.stringify({
        model: this.#model,
        url,
        format: 'markdown',
        max_characters: MAX_WEB_FETCH_CHARACTERS,
      }),
      signal: AbortSignal.timeout(WEB_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new ResearchProviderError(`Web fetch failed with status ${response.status}.`);
    }

    const parsed = webFetchResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new ResearchProviderError('Web fetch returned an invalid response.');
    }

    return {
      url: parsed.data.url,
      title: parsed.data.title.slice(0, 300),
      content: parsed.data.content.text.slice(0, MAX_WEB_FETCH_CHARACTERS),
      ...(parsed.data.metadata?.author ? { author: parsed.data.metadata.author } : {}),
      ...(parsed.data.metadata?.published_at
        ? { publishedAt: parsed.data.metadata.published_at }
        : {}),
    };
  }
}
