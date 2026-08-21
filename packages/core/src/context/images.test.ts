import { describe, expect, it } from 'vitest';
import { isSupportedImage } from './images.js';

describe('isSupportedImage', () => {
  it.each([
    ['image/png', 'random.txt'],
    ['image/jpeg', 'random.txt'],
    [undefined, 'photo.webp'],
  ])('recognizes supported image %s / %s', (contentType, filename) => {
    expect(isSupportedImage(contentType, filename)).toBe(true);
  });

  it('rejects a non-image attachment', () => {
    expect(isSupportedImage('text/plain', 'random.txt')).toBe(false);
  });
});
