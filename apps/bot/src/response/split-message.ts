export const DISCORD_SAFE_MESSAGE_LENGTH = 1_900;

function lastSentenceBoundary(value: string): number {
  let boundary = -1;
  for (const match of value.matchAll(/[.!?]["')\]]*\s+/gu)) {
    boundary = (match.index ?? 0) + match[0].length;
  }
  return boundary;
}

function safeHardBoundary(value: string, maximumLength: number): number {
  let boundary = maximumLength;
  const lastCodeUnit = value.charCodeAt(boundary - 1);
  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) {
    boundary -= 1;
  }
  return Math.max(boundary, 1);
}

function findBoundary(value: string, maximumLength: number): number {
  const candidate = value.slice(0, maximumLength + 1);
  const minimumUsefulBoundary = Math.floor(maximumLength / 2);
  const boundaries = [
    candidate.lastIndexOf('\n\n', maximumLength) + 2,
    candidate.lastIndexOf('\n', maximumLength) + 1,
    lastSentenceBoundary(candidate.slice(0, maximumLength + 1)),
    candidate.lastIndexOf(' ', maximumLength) + 1,
  ];

  return (
    boundaries.find((boundary) => boundary >= minimumUsefulBoundary && boundary <= maximumLength) ??
    safeHardBoundary(value, maximumLength)
  );
}

export function splitDiscordMessage(
  content: string,
  maximumLength = DISCORD_SAFE_MESSAGE_LENGTH,
): string[] {
  if (!Number.isInteger(maximumLength) || maximumLength < 1) {
    throw new RangeError('maximumLength must be a positive integer.');
  }

  const chunks: string[] = [];
  let remaining = content.trim();

  while (remaining.length > maximumLength) {
    const boundary = findBoundary(remaining, maximumLength);
    const chunk = remaining.slice(0, boundary).trimEnd();
    chunks.push(chunk || remaining.slice(0, safeHardBoundary(remaining, maximumLength)));
    remaining = remaining.slice(boundary).trimStart();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}
