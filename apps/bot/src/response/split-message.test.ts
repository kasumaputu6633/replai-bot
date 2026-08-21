import { describe, expect, it } from 'vitest';
import { splitDiscordMessage } from './split-message.js';

describe('splitDiscordMessage', () => {
  it('keeps short content in one chunk', () => {
    expect(splitDiscordMessage('Short response', 100)).toEqual(['Short response']);
  });

  it('prefers paragraph boundaries', () => {
    const chunks = splitDiscordMessage(`${'a'.repeat(60)}\n\n${'b'.repeat(60)}`, 80);
    expect(chunks).toEqual(['a'.repeat(60), 'b'.repeat(60)]);
  });

  it('hard-splits long text without newlines', () => {
    const chunks = splitDiscordMessage('x'.repeat(251), 100);
    expect(chunks.map((chunk) => chunk.length)).toEqual([100, 100, 51]);
  });

  it('does not split Unicode surrogate pairs', () => {
    const chunks = splitDiscordMessage('🙂'.repeat(120), 101);
    expect(chunks.every((chunk) => chunk.length <= 101)).toBe(true);
    expect(chunks.join('')).toBe('🙂'.repeat(120));
    expect(chunks.every((chunk) => !chunk.includes('\uFFFD'))).toBe(true);
  });

  it('keeps every URL chunk within the configured limit', () => {
    const content = `Evidence: https://example.com/${'a'.repeat(200)}`;
    const chunks = splitDiscordMessage(content, 80);
    expect(chunks.every((chunk) => chunk.length <= 80)).toBe(true);
  });
});
