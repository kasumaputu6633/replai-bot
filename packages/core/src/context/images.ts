import type { SourceAttachment } from './types.js';

const IMAGE_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

export function isSupportedImage(contentType?: string, filename?: string): boolean {
  if (contentType && IMAGE_CONTENT_TYPES.has(contentType.toLowerCase().split(';', 1)[0] ?? '')) {
    return true;
  }

  if (!filename) {
    return false;
  }

  const cleanFilename = filename.split(/[?#]/u, 1)[0]?.toLowerCase() ?? '';
  return [...IMAGE_EXTENSIONS].some((extension) => cleanFilename.endsWith(extension));
}

export function isImageAttachment(attachment: SourceAttachment): boolean {
  return isSupportedImage(attachment.contentType, attachment.filename);
}
