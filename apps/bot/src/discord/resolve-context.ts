import type { Message } from 'discord.js';

export const MAX_REPLY_CHAIN_DEPTH = 8;
export const MAX_THREAD_CONTEXT_MESSAGES = 12;
export const MAX_AMBIENT_CONTEXT_MESSAGES = 4;
export const MAX_CONTEXT_MESSAGES = 16;
export const MAX_CONTEXT_CHARACTERS = 20_000;
export const MAX_AMBIENT_CONTEXT_CHARACTERS = 5_000;
export const MAX_AMBIENT_CONTEXT_AGE_MS = 10 * 60 * 1_000;

export type DiscordContextRole = 'user' | 'assistant' | 'participant';

export interface DiscordContextTurn {
  messageId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string;
  role: DiscordContextRole;
  text: string;
  createdAt: string;
}

export interface ResolveDiscordContextOptions {
  botUserId: string;
  queryingUserId: string;
  /**
   * Allows recent channel chatter to act as the evidence source.
   *
   * Only set this when the query cannot stand on its own, such as a bare mention
   * or an explicit reference to what was just said. A self-contained question
   * must never be answered against an unrelated ambient message.
   */
  allowAmbientSource?: boolean | undefined;
  now?: (() => number) | undefined;
}

export interface ResolvedDiscordContext {
  /** Present only for an explicit reply chain, or for an allowed ambient fallback. */
  source: Message | null;
  /** The message directly replied to, unlike source which is the chain's oldest ancestor. */
  replyTarget: Message | null;
  turns: DiscordContextTurn[];
}

function compareMessages(left: Message, right: Message): number {
  const timestampDifference = left.createdTimestamp - right.createdTimestamp;
  return timestampDifference !== 0 ? timestampDifference : left.id.localeCompare(right.id);
}

function roleFor(message: Message, options: ResolveDiscordContextOptions): DiscordContextRole {
  if (message.author.id === options.botUserId) {
    return 'assistant';
  }
  if (message.author.id === options.queryingUserId) {
    return 'user';
  }
  return 'participant';
}

function authorNameFor(message: Message): string {
  return (
    message.member?.displayName ??
    message.author.displayName ??
    message.author.globalName ??
    message.author.username ??
    message.author.id
  ).slice(0, 100);
}

function compactMessages(
  messages: readonly Message[],
  options: ResolveDiscordContextOptions,
  limits: { maxMessages: number; maxCharacters: number },
): DiscordContextTurn[] {
  const turns: DiscordContextTurn[] = [];
  let remainingCharacters = limits.maxCharacters;

  for (const message of messages.slice(0, limits.maxMessages)) {
    const text = message.content.trim();
    if (text.length > 0 && remainingCharacters === 0) {
      break;
    }

    const boundedText = text.slice(0, remainingCharacters);
    turns.push({
      messageId: message.id,
      authorId: message.author.id,
      authorName: authorNameFor(message),
      authorAvatarUrl: message.author.displayAvatarURL({ extension: 'png', size: 256 }),
      role: roleFor(message, options),
      text: boundedText,
      createdAt: new Date(message.createdTimestamp).toISOString(),
    });
    remainingCharacters -= boundedText.length;

    if (boundedText.length < text.length) {
      break;
    }
  }

  return turns;
}

async function resolveReplyChain(query: Message): Promise<Message[]> {
  const newestFirst: Message[] = [];
  const visited = new Set<string>([query.id]);
  let current = query;

  for (let depth = 0; depth < MAX_REPLY_CHAIN_DEPTH; depth += 1) {
    const reference = current.reference;
    if (
      !reference?.messageId ||
      reference.channelId !== query.channelId ||
      visited.has(reference.messageId)
    ) {
      break;
    }

    let ancestor: Message;
    try {
      ancestor = await current.fetchReference();
    } catch {
      break;
    }

    if (ancestor.channelId !== query.channelId || visited.has(ancestor.id)) {
      break;
    }

    visited.add(ancestor.id);
    newestFirst.push(ancestor);
    current = ancestor;
  }

  return newestFirst.reverse();
}

async function fetchRecentChannelHistory(query: Message, limit: number): Promise<Message[]> {
  try {
    if (!('messages' in query.channel) || typeof query.channel.messages?.fetch !== 'function') {
      return [];
    }
    const messages = await query.channel.messages.fetch({
      before: query.id,
      limit,
      cache: false,
    });
    return [...messages.values()];
  } catch {
    return [];
  }
}

/**
 * Resolves the query's evidence chain plus bounded surrounding conversation.
 *
 * A reply chain is authoritative: its oldest ancestor becomes the source. Without a
 * reply, recent channel messages are returned as ambient context only, and they are
 * promoted to `source` exclusively when the caller opts in via `allowAmbientSource`.
 * Ambient messages are additionally bounded by age so a stale topic cannot hijack a
 * fresh question. Inaccessible ancestors and fetch failures degrade gracefully.
 */
export async function resolveDiscordContext(
  query: Message,
  options: ResolveDiscordContextOptions,
): Promise<ResolvedDiscordContext | null> {
  const replyChain = await resolveReplyChain(query);
  const replySource = replyChain[0] ?? null;
  const replyTarget = replyChain[replyChain.length - 1] ?? null;
  const isThread = query.channel.isThread();
  const usesFullHistory = replySource !== null || isThread;
  const historyLimit = usesFullHistory
    ? MAX_THREAD_CONTEXT_MESSAGES
    : MAX_AMBIENT_CONTEXT_MESSAGES;
  const maxMessages = usesFullHistory ? MAX_CONTEXT_MESSAGES : MAX_AMBIENT_CONTEXT_MESSAGES;
  const maxCharacters = usesFullHistory
    ? MAX_CONTEXT_CHARACTERS
    : MAX_AMBIENT_CONTEXT_CHARACTERS;

  const chainIds = new Set(replyChain.map((message) => message.id));
  const availableHistorySlots = maxMessages - replyChain.length;
  const now = options.now?.() ?? Date.now();
  const history = (await fetchRecentChannelHistory(query, historyLimit))
    .filter((message) => message.id !== query.id && !chainIds.has(message.id))
    .filter(
      (message) =>
        usesFullHistory || now - message.createdTimestamp <= MAX_AMBIENT_CONTEXT_AGE_MS,
    )
    .sort(compareMessages)
    .slice(-Math.max(availableHistorySlots, 0));
  const contextMessages = [...replyChain, ...history].sort(compareMessages);

  if (contextMessages.length === 0) {
    return null;
  }

  const turns = compactMessages(contextMessages, options, { maxMessages, maxCharacters });

  if (replySource) {
    return { source: replySource, replyTarget, turns };
  }

  return {
    source: options.allowAmbientSource
      ? (contextMessages[contextMessages.length - 1] ?? null)
      : null,
    replyTarget: null,
    turns,
  };
}
