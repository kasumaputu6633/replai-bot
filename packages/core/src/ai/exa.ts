import { z } from 'zod';
import { ResearchProviderError } from '../errors/index.js';
import type { WebFetchResult, WebSearchResult } from './types.js';

export const MAX_EXA_SEARCH_QUERY_LENGTH = 500;
export const MAX_EXA_TEXT_CHARACTERS = 6_000;

const EXA_TIMEOUT_MS = 20_000;

/**
 * Exa returns per-result text under `text` and dates under `publishedDate`.
 *
 * Optional fields are tolerated loosely because a crawl can succeed with metadata
 * missing, and a partial result is still useful evidence.
 */
const exaResultSchema = z.object({
  url: z.string(),
  title: z.string().nullish(),
  text: z.string().nullish(),
  author: z.string().nullish(),
  publishedDate: z.string().nullish(),
});

const exaSearchResponseSchema = z.object({
  results: z.array(exaResultSchema),
});

const exaContentsResponseSchema = z.object({
  results: z.array(exaResultSchema),
  statuses: z
    .array(
      z.object({
        id: z.string(),
        status: z.enum(['success', 'error']),
        error: z
          .object({ tag: z.string().nullish(), httpStatusCode: z.number().nullish() })
          .nullish(),
      }),
    )
    .optional(),
});

export interface ExaClientConfig {
  apiKey: string;
  baseURL: string;
  maxResults?: number | undefined;
  fetchImplementation?: typeof fetch | undefined;
}

function endpointFor(baseURL: string, path: string): string {
  return `${baseURL.replace(/\/+$/u, '')}${path}`;
}

function titleFor(result: z.infer<typeof exaResultSchema>): string {
  const title = result.title?.trim();
  if (title) {
    return title.slice(0, 300);
  }

  try {
    return new URL(result.url).hostname.replace(/^www\./u, '');
  } catch {
    return 'Untitled result';
  }
}

/**
 * Talks to Exa's native REST API.
 *
 * Kept separate from the OpenAI-style gateway client because Exa uses its own field
 * names (`numResults`, `text`, `publishedDate`) and an `x-api-key` header, so reusing
 * the gateway shape would silently return nothing.
 */
export class ExaWebClient {
  readonly #apiKey: string;
  readonly #baseURL: string;
  readonly #fetch: typeof fetch;
  readonly #maxResults: number;

  public constructor(config: ExaClientConfig) {
    this.#apiKey = config.apiKey;
    this.#baseURL = config.baseURL;
    this.#fetch = config.fetchImplementation ?? fetch;
    this.#maxResults = Math.min(Math.max(config.maxResults ?? 5, 1), 10);
  }

  async #post(path: string, body: unknown): Promise<unknown> {
    const response = await this.#fetch(endpointFor(this.#baseURL, path), {
      method: 'POST',
      headers: {
        'x-api-key': this.#apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'Replai/0.1.0',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(EXA_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new ResearchProviderError(`Exa request failed with status ${response.status}.`);
    }

    return response.json();
  }

  public async search(query: string): Promise<WebSearchResult[]> {
    const payload = await this.#post('/search', {
      query: query.slice(0, MAX_EXA_SEARCH_QUERY_LENGTH),
      numResults: this.#maxResults,
      type: 'auto',
      contents: { text: { maxCharacters: 1_500 } },
    });

    const parsed = exaSearchResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ResearchProviderError('Exa search returned an invalid response.');
    }

    return parsed.data.results.slice(0, this.#maxResults).map((result) => ({
      title: titleFor(result),
      url: result.url,
      snippet: (result.text ?? '').trim().slice(0, 1_500),
      ...(result.publishedDate ? { publishedAt: result.publishedDate } : {}),
    }));
  }

  public async fetch(url: string): Promise<WebFetchResult> {
    const payload = await this.#post('/contents', {
      urls: [url],
      text: { maxCharacters: MAX_EXA_TEXT_CHARACTERS },
    });

    const parsed = exaContentsResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ResearchProviderError('Exa contents returned an invalid response.');
    }

    // Per-URL crawl failures arrive as HTTP 200 with an error status and no result.
    const failure = parsed.data.statuses?.find((status) => status.status === 'error');
    const result = parsed.data.results[0];
    if (!result) {
      throw new ResearchProviderError(
        failure?.error?.tag
          ? `Exa could not fetch the page (${failure.error.tag}).`
          : 'Exa returned no content for the requested URL.',
      );
    }

    return {
      url: result.url,
      title: titleFor(result),
      content: (result.text ?? '').slice(0, MAX_EXA_TEXT_CHARACTERS),
      ...(result.author ? { author: result.author } : {}),
      ...(result.publishedDate ? { publishedAt: result.publishedDate } : {}),
    };
  }
}
