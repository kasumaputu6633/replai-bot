const FORMAT_SENSITIVE_REQUEST =
  /\b(?:puisi|pantun|sajak|poem|poetry|lirik|lyrics|kode|code|markdown|format|daftar|list|bullet|baris|line\s*break|paragraf|dialog|dialogue)\b/iu;
const STRUCTURED_OUTPUT =
  /(?:```|^#{1,6}\s|^\s*(?:[-*+] |\d+[.)]\s)|^\s*> |^\|.+\|\s*$)/mu;

const MAX_COMPACT_REPLY_LENGTH = 600;
const MAX_COMPACT_REPLY_LINES = 6;

export function compactConversationReply(content: string, request: string): string {
  const trimmed = content.trim();
  if (
    trimmed.length > MAX_COMPACT_REPLY_LENGTH ||
    trimmed.split('\n').length > MAX_COMPACT_REPLY_LINES ||
    FORMAT_SENSITIVE_REQUEST.test(request) ||
    STRUCTURED_OUTPUT.test(trimmed)
  ) {
    return trimmed;
  }

  return trimmed
    .replace(/\s*—\s*/gu, ', ')
    .replace(/[ \t]*\n+[ \t]*/gu, ' ')
    .replace(/ {2,}/gu, ' ');
}
