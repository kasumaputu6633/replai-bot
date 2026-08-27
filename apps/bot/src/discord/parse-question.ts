export const DEFAULT_QUESTION = 'Apa yang lagi diobrolin? Tanggapi santai sesuai konteks chat.';

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
