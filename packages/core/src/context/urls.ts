const URL_PATTERN = /https?:\/\/[^\s<>{}\u005B\u005D"']+/giu;
const TRAILING_PUNCTUATION = /[.,!?;:]+$/u;

export function extractHttpUrls(...values: Array<string | null | undefined>): string[] {
  const urls = new Set<string>();

  for (const value of values) {
    if (!value) {
      continue;
    }

    for (const match of value.matchAll(URL_PATTERN)) {
      const candidate = match[0].replace(TRAILING_PUNCTUATION, '');

      try {
        const parsed = new URL(candidate);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          urls.add(parsed.href);
        }
      } catch {
        // Ignore malformed URL-like text.
      }
    }
  }

  return [...urls];
}
