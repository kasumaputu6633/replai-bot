import { describe, expect, it } from 'vitest';
import { extractHttpUrls } from './urls.js';

describe('extractHttpUrls', () => {
  it('extracts and deduplicates HTTP URLs', () => {
    expect(
      extractHttpUrls(`
        https://example.com
        https://example.com
        https://openai.com
      `),
    ).toEqual(['https://example.com/', 'https://openai.com/']);
  });

  it('removes trailing sentence punctuation', () => {
    expect(extractHttpUrls('Read https://example.com/story?x=1, then verify it.')).toEqual([
      'https://example.com/story?x=1',
    ]);
  });
});
