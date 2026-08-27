import type { Message } from 'discord.js';

export const MAX_REPLY_CHAIN_DEPTH = 6;
export const MAX_THREAD_CONTEXT_MESSAGES = 8;
export const MAX_CONTEXT_MESSAGES = 10;
export const MAX_CONTEXT_CHARACTERS = 12_000;

export type DiscordContextRole = 'user' | 'assistant' | 'participant';

export interface DiscordContextTurn {
  messageId: string;
  authorId: string;
  role: DiscordContextRole;
  text: string;
  createdAt: string;
}

export interface ResolveDiscordContextOptions {
  botUserId: string;
  queryingUserId: string;
}

export interface ResolvedDiscordContext {
  source: Message;
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

function compactMessages(
  messages: readonly Message[],
  options: ResolveDiscordContextOptions,
): DiscordContextTurn[] {
  const turns: DiscordContextTurn[] = [];
  let remainingCharacters = MAX_CONTEXT_CHARACTERS;

  for (const message of messages.slice(0, MAX_CONTEXT_MESSAGES)) {
    const text = message.content.trim();
    if (text.length > 0 && remainingCharacters === 0) {
      break;
    }

    const boundedText = text.slice(0, remainingCharacters);
    turns.push({
      messageId: message.id,
      authorId: message.author.id,
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

async function fetchRecentChannelHistory(query: Message): Promise<Message[]> {
  try {
    if (!('messages' in query.channel) || typeof query.channel.messages?.fetch !== 'function') {
      return [];
    }
    const messages = await query.channel.messages.fetch({
      before: query.id,
      limit: MAX_THREAD_CONTEXT_MESSAGES,
      cache: false,
    });
    return [...messages.values()];
  } catch {
    return [];
  }
}

/**
 * Resolves the query's same-channel evidence chain and bounded channel/thread context.
 * When an immediate reference is present, it resolves the reply chain.
 * Inaccessible ancestors or fetch failures fall back gracefully to the resolved context.
 */
export async function resolveDiscordContext(
  query: Message,
  options: ResolveDiscordContextOptions,
): Promise<ResolvedDiscordContext | null> {
  const replyChain = await resolveReplyChain(query);
  const source = replyChain[0];

  const chainIds = new Set(replyChain.map((message) => message.id));
  const availableHistorySlots = MAX_CONTEXT_MESSAGES - replyChain.length;
  const history = (await fetchRecentChannelHistory(query))
    .filter((message) => message.id !== query.id && !chainIds.has(message.id))
    .sort(compareMessages)
    .slice(-availableHistorySlots);
  const contextMessages = [...replyChain, ...history].sort(compareMessages);

  if (!source) {
    if (contextMessages.length === 0) {
      return null;
    }
    return {
      source: contextMessages[contextMessages.length - 1]!,
      turns: compactMessages(contextMessages, options),
    };
  }

  return {
    source,
    turns: compactMessages(contextMessages, options),
  };
}
