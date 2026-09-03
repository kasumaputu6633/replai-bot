import { describe, expect, it, vi } from 'vitest';
import { ExaWebClient, MAX_EXA_TEXT_CHARACTERS } from './exa.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ExaWebClient search', () => {
  it('sends Exa native fields and normalizes text into snippets', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      jsonResponse({
        requestId: 'abc',
        results: [
          {
            url: 'https://discordjs.dev/docs/packages/builders/main/FileUploadBuilder:Class',
            title: 'FileUploadBuilder',
            text: 'A builder that creates API-compatible JSON for file upload components.',
            publishedDate: '2026-08-20T00:00:00.000Z',
          },
        ],
      }),
    );
    const client = new ExaWebClient({
      apiKey: 'exa-key',
      baseURL: 'https://api.exa.ai/',
      maxResults: 5,
      fetchImplementation: fetchMock as typeof fetch,
    });

    await expect(client.search('discord.js FileUploadBuilder')).resolves.toEqual([
      {
        title: 'FileUploadBuilder',
        url: 'https://discordjs.dev/docs/packages/builders/main/FileUploadBuilder:Class',
        snippet: 'A builder that creates API-compatible JSON for file upload components.',
        publishedAt: '2026-08-20T00:00:00.000Z',
      },
    ]);

    const [url, options] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.exa.ai/search');
    expect((options?.headers as Record<string, string>)['x-api-key']).toBe('exa-key');
    expect(JSON.parse(String(options?.body))).toMatchObject({
      query: 'discord.js FileUploadBuilder',
      numResults: 5,
    });
  });

  it('falls back to the hostname when a result has no title', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      jsonResponse({ results: [{ url: 'https://www.discord.com/developers/docs' }] }),
    );
    const client = new ExaWebClient({
      apiKey: 'exa-key',
      baseURL: 'https://api.exa.ai',
      fetchImplementation: fetchMock as typeof fetch,
    });

    await expect(client.search('discord docs')).resolves.toEqual([
      {
        title: 'discord.com',
        url: 'https://www.discord.com/developers/docs',
        snippet: '',
      },
    ]);
  });

  it('raises a provider error for a failed request', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Invalid API key' }, 401));
    const client = new ExaWebClient({
      apiKey: 'bad-key',
      baseURL: 'https://api.exa.ai',
      fetchImplementation: fetchMock as typeof fetch,
    });

    await expect(client.search('anything')).rejects.toThrow(/status 401/u);
  });
});

describe('ExaWebClient fetch', () => {
  it('requests contents by URL and bounds the extracted text', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      jsonResponse({
        results: [
          {
            url: 'https://discordjs.guide/interactions/modals',
            title: 'Modals',
            text: 'x'.repeat(MAX_EXA_TEXT_CHARACTERS + 500),
            author: 'discord.js',
            publishedDate: '2026-08-01T00:00:00.000Z',
          },
        ],
        statuses: [{ id: 'https://discordjs.guide/interactions/modals', status: 'success' }],
      }),
    );
    const client = new ExaWebClient({
      apiKey: 'exa-key',
      baseURL: 'https://api.exa.ai',
      fetchImplementation: fetchMock as typeof fetch,
    });

    const result = await client.fetch('https://discordjs.guide/interactions/modals');

    expect(result.content).toHaveLength(MAX_EXA_TEXT_CHARACTERS);
    expect(result).toMatchObject({
      url: 'https://discordjs.guide/interactions/modals',
      title: 'Modals',
      author: 'discord.js',
      publishedAt: '2026-08-01T00:00:00.000Z',
    });

    const [url, options] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.exa.ai/contents');
    expect(JSON.parse(String(options?.body))).toMatchObject({
      urls: ['https://discordjs.guide/interactions/modals'],
    });
  });

  it('surfaces a per-URL crawl failure reported with HTTP 200', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      jsonResponse({
        results: [],
        statuses: [
          {
            id: 'https://example.com/missing',
            status: 'error',
            error: { tag: 'CRAWL_NOT_FOUND', httpStatusCode: 404 },
          },
        ],
      }),
    );
    const client = new ExaWebClient({
      apiKey: 'exa-key',
      baseURL: 'https://api.exa.ai',
      fetchImplementation: fetchMock as typeof fetch,
    });

    await expect(client.fetch('https://example.com/missing')).rejects.toThrow(
      /CRAWL_NOT_FOUND/u,
    );
  });
});
