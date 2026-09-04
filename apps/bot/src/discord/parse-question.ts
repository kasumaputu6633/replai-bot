export const DEFAULT_QUESTION = 'Apa yang lagi diobrolin? Tanggapi santai sesuai konteks chat.';

/**
 * Signals that the query cannot be understood on its own and needs the surrounding chat.
 *
 * Only these deictic references justify answering against an ambient channel message.
 * A self-contained question must be answered on its own terms instead.
 */
const CONTEXT_REFERENCE =
  /(?:\b(?:ini|itu|tadi|tuh|nih|dia|mereka|orangnya|lanjut|lanjutin|maksudnya|sebelumnya|barusan|gimana\s+menurutmu)\b|\bdi\s*atas\b|\byang\s+(?:tadi|itu|ini)\b|\b(?:this|that|it|they|them|above|earlier|previous)\b)/iu;

/**
 * Signals that the user is correcting the bot's previous assumption.
 *
 * When present, stale context must be dropped instead of reinforced, otherwise the bot
 * acknowledges the correction and then repeats the same wrong claim.
 */
const USER_CORRECTION =
  /(?:\b(?:beda|bukan|salah|keliru|ketuker|ketukar|bkn|bukannya|setahu|setau|seingat)\b|\bkan\s+(?:yang|itu|beda)\b|\bnggak\s+(?:gitu|begitu)\b|\bgak\s+(?:gitu|begitu)\b|\b(?:wrong|not\s+me|different\s+user|mistaken|i\s+(?:think|thought))\b)/iu;

export function parseQuestion(
  content: string,
  botUserId: string,
  botRoleIds: readonly string[] = [],
): string {
  const escapedUserId = botUserId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const rolePatterns = botRoleIds.map((roleId) => {
    const escapedRoleId = roleId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    return `<@&${escapedRoleId}>`;
  });
  const mentionPattern = new RegExp([`<@!?${escapedUserId}>`, ...rolePatterns].join('|'), 'gu');
  const question = content.replace(mentionPattern, ' ').replace(/\s+/gu, ' ').trim();

  return question || DEFAULT_QUESTION;
}

/** Reports whether the question leans on surrounding chat to be intelligible. */
export function referencesSurroundingContext(question: string): boolean {
  return question === DEFAULT_QUESTION || CONTEXT_REFERENCE.test(question);
}

/** Reports whether the question corrects a previous bot assumption. */
export function correctsPreviousAssumption(question: string): boolean {
  return USER_CORRECTION.test(question);
}
