import { z } from 'zod';
import { ResearchProviderError } from '../errors/index.js';
import { researchTargetLabel, resolveResearchMode } from '../research/mode.js';
import type { ResearchInput } from '../research/types.js';
import type { WebSearchResult } from './types.js';

const MAX_SEARCH_QUERY_LENGTH = 500;
const SEARCH_TIMEOUT_MS = 20_000;
const CASUAL_GREETING_OR_THANKS =
  /^(?:(?:halo|hai|hey|hi|yo|pagi|siang|malam|apa kabar|makasih|terima kasih|thanks?|thx|wkwk|haha)[\s!,.?]*)+$/iu;
const CASUAL_BANTER =
  /\b(?:wkwk+|haha+|hehe+|lol|lmao|bercanda|jokes?|lucu|ngakak|receh|roast)\b/iu;
const RELATIONSHIP_BANTER =
  /\b(?:saling\s+suka|naksir|gebetan|jadian|pacaran|chemistry|bucin|cinlok|shipping|di-?ship|crush)\b/iu;
const CASUAL_SPECULATION =
  /\b(?:menurut(?:\s+(?:kamu|lu|loe|lo))?|menurutmu|kira[- ]?kira|kayaknya|bakal|tebak(?:an)?|guess)\b/iu;
const PRIVATE_DISCORD_CONTEXT =
  /(?:\b(?:discord|server\s+ini|di\s+(?:server|sini)|member|anggota|obrolan|chat|dia|mereka|orang\s+ini)\b|\bdi\s*discord\b)/iu;

const searchResponseSchema = z.object({
  results: z.array(
    z.object({
      title: z.string().catch('Untitled result'),
      url: z.url(),
      snippet: z.string().catch(''),
      published_at: z.string().nullish(),
    }),
  ),
});

export interface NineRouterWebSearchConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  maxResults: number;
  fetchImplementation?: typeof fetch | undefined;
}

export function buildWebSearchQuery(input: ResearchInput, now = new Date()): string {
  const embedText = input.source.embeds.flatMap((embed) => [embed.title, embed.description]);
  if (resolveResearchMode(input) === 'compare') {
    const targetContext = [
      `Research target: ${researchTargetLabel(input.source, 1)}`,
      ...input.source.urls,
      ...embedText,
      ...input.source.embeds.flatMap((embed) => (embed.url ? [embed.url] : [])),
      'Find official documentation, source repository, features, architecture, limitations, and independent benchmarks for this target.',
      `Current date: ${now.toISOString().slice(0, 10)}`,
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .join('\n');

    return targetContext.slice(0, MAX_SEARCH_QUERY_LENGTH);
  }

  const context = [
    input.source.text,
    ...input.source.urls,
    ...embedText,
    ...input.source.embeds.flatMap((embed) => (embed.url ? [embed.url] : [])),
    input.question,
    `Current date: ${now.toISOString().slice(0, 10)}`,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n');

  return context.slice(0, MAX_SEARCH_QUERY_LENGTH);
}

export function isCasualConversationInput(input: ResearchInput): boolean {
  return (
    resolveResearchMode(input) === 'answer' &&
    (CASUAL_GREETING_OR_THANKS.test(input.question.trim()) ||
      CASUAL_BANTER.test(input.question) ||
      RELATIONSHIP_BANTER.test(input.question) ||
      (CASUAL_SPECULATION.test(input.question) && PRIVATE_DISCORD_CONTEXT.test(input.question)))
  );
}

export function hasSearchableWebContext(input: ResearchInput): boolean {
  if (isCasualConversationInput(input)) {
    return false;
  }

  return Boolean(
    input.source.text?.trim() ||
      input.source.urls.length > 0 ||
      input.source.embeds.some((embed) => embed.title || embed.description || embed.url),
  );
}

export class NineRouterWebSearchClient {
  readonly #apiKey: string;
  readonly #endpoint: string;
  readonly #fetch: typeof fetch;
  readonly #maxResults: number;
  readonly #model: string;

  public constructor(config: NineRouterWebSearchConfig) {
    this.#apiKey = config.apiKey;
    this.#endpoint = `${config.baseURL.replace(/\/+$/u, '')}/search`;
    this.#fetch = config.fetchImplementation ?? fetch;
    this.#maxResults = Math.min(Math.max(config.maxResults, 1), 10);
    this.#model = config.model.endsWith('/search')
      ? config.model.slice(0, -'/search'.length)
      : config.model;
  }

  public async search(query: string): Promise<WebSearchResult[]> {
    const response = await this.#fetch(this.#endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.#apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Replai/0.1.0',
      },
      body: JSON.stringify({
        model: this.#model,
        query: query.slice(0, MAX_SEARCH_QUERY_LENGTH),
        max_results: this.#maxResults,
      }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new ResearchProviderError(`Web search failed with status ${response.status}.`);
    }

    const parsed = searchResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new ResearchProviderError('Web search returned an invalid response.');
    }

    return parsed.data.results.slice(0, this.#maxResults).map((result) => ({
      title: result.title.slice(0, 300),
      url: result.url,
      snippet: result.snippet.slice(0, 1_500),
      ...(result.published_at ? { publishedAt: result.published_at } : {}),
    }));
  }
}
