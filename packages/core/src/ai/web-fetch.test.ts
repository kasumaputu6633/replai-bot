import { describe, expect, it, vi } from 'vitest';
import {
  isAllowedWebFetchUrl,
  MAX_WEB_FETCH_CHARACTERS,
  NineRouterWebFetchClient,
} from './web-fetch.js';

describe('isAllowedWebFetchUrl', () => {
  it.each([
    'https://www.instagram.com/reel/example',
    'https://youtu.be/example',
    'https://mobile.twitter.com/example/status/1',
    'https://www.reddit.com/r/example/comments/1',
  ])('allows an approved social URL: %s', (url) => {
    expect(isAllowedWebFetchUrl(url)).toBe(true);
  });

  it.each([
    'https://example.com/article',
    'https://instagram.com.evil.example/reel/1',
    'https://user:password@instagram.com/reel/1',
    'https://instagram.com:8443/reel/1',
    'http://127.0.0.1/internal',
    'file:///etc/passwd',
  ])('rejects a non-allowlisted or unsafe URL: %s', (url) => {
    expect(isAllowedWebFetchUrl(url)).toBe(false);
  });
});

describe('NineRouterWebFetchClient', () => {
  it('fetches and bounds normalized social-page content', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          provider: 'exa',
          url: 'https://www.instagram.com/reel/example',
          title: 'Instagram post',
          content: {
            format: 'markdown',
            text: 'x'.repeat(MAX_WEB_FETCH_CHARACTERS + 100),
          },
          metadata: {
            author: 'Example Author',
            published_at: '2026-08-21',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const client = new NineRouterWebFetchClient({
      apiKey: 'test-key',
      baseURL: 'https://gateway.example/v1/',
      model: 'exa/fetch',
      fetchImplementation: fetchMock,
    });

    const result = await client.fetch('https://www.instagram.com/reel/example');

    expect(result).toMatchObject({
      url: 'https://www.instagram.com/reel/example',
      title: 'Instagram post',
      author: 'Example Author',
      publishedAt: '2026-08-21',
    });
    expect(result.content).toHaveLength(MAX_WEB_FETCH_CHARACTERS);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://gateway.example/v1/web/fetch');
    expect(JSON.parse(String(options?.body))).toEqual({
      model: 'exa',
      url: 'https://www.instagram.com/reel/example',
      format: 'markdown',
      max_characters: MAX_WEB_FETCH_CHARACTERS,
    });
  });
});
