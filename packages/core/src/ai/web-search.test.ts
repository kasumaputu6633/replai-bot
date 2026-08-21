import { describe, expect, it, vi } from 'vitest';
import type { ResearchInput } from '../research/types.js';
import {
  buildWebSearchQuery,
  hasSearchableWebContext,
  NineRouterWebSearchClient,
} from './web-search.js';

const input: ResearchInput = {
  question: 'Is this current?',
  source: {
    messageId: 'source-1',
    text: 'A claim about a recent event',
    urls: [],
    images: [],
    attachments: [],
    embeds: [],
  },
};

describe('buildWebSearchQuery', () => {
  it('includes the claim, question, and current date', () => {
    expect(buildWebSearchQuery(input, new Date('2026-08-21T00:00:00.000Z'))).toBe(
      'A claim about a recent event\nIs this current?\nCurrent date: 2026-08-21',
    );
  });

  it('isolates comparison searches to the current target', () => {
    const query = buildWebSearchQuery(
      {
        ...input,
        mode: 'compare',
        question: 'Compare JCode with Kilo Code',
        source: {
          ...input.source,
          text: 'Kilo Code',
          urls: [],
          embeds: [],
        },
      },
      new Date('2026-08-21T00:00:00.000Z'),
    );

    expect(query).toContain('Research target: Kilo Code');
    expect(query).toContain('official documentation');
    expect(query).not.toContain('JCode');
  });

  it('includes URLs when the source has no text', () => {
    const query = buildWebSearchQuery(
      {
        question: 'Apa isi sumber ini?',
        source: {
          messageId: 'source-url',
          text: null,
          urls: ['https://example.com/claim'],
          images: [],
          attachments: [],
          embeds: [],
        },
      },
      new Date('2026-08-21T00:00:00.000Z'),
    );

    expect(query).toContain('https://example.com/claim');
    expect(query).toContain('Apa isi sumber ini?');
  });
});

describe('hasSearchableWebContext', () => {
  it('allows search when the source contains a textual claim', () => {
    expect(hasSearchableWebContext(input)).toBe(true);
  });

  it('skips search for image-only identification', () => {
    expect(
      hasSearchableWebContext({
        question: 'Ini makanan apa ya?',
        source: {
          messageId: 'source-2',
          text: null,
          urls: [],
          images: [{ url: 'https://cdn.example.com/food.jpg' }],
          attachments: [
            { url: 'https://cdn.example.com/food.jpg', filename: 'food.jpg' },
          ],
          embeds: [],
        },
      }),
    ).toBe(false);
  });
});

describe('NineRouterWebSearchClient', () => {
  it('calls the search endpoint and normalizes bounded results', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              title: 'Official update',
              url: 'https://example.com/update',
              snippet: 'A current primary-source update.',
              published_at: '2026-08-20',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const client = new NineRouterWebSearchClient({
      apiKey: 'test-key',
      baseURL: 'https://gateway.example/v1/',
      model: 'exa/search',
      maxResults: 5,
      fetchImplementation: fetchMock as typeof fetch,
    });

    await expect(client.search('recent claim')).resolves.toEqual([
      {
        title: 'Official update',
        url: 'https://example.com/update',
        snippet: 'A current primary-source update.',
        publishedAt: '2026-08-20',
      },
    ]);

    const [url, options] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://gateway.example/v1/search');
    expect(JSON.parse(String(options?.body))).toEqual({
      model: 'exa',
      query: 'recent claim',
      max_results: 5,
    });
  });
});
