import type { Message } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_AMBIENT_CONTEXT_AGE_MS,
  MAX_AMBIENT_CONTEXT_MESSAGES,
  MAX_CONTEXT_CHARACTERS,
  MAX_REPLY_CHAIN_DEPTH,
  MAX_THREAD_CONTEXT_MESSAGES,
  resolveDiscordContext,
} from './resolve-context.js';

interface FakeMessageOptions {
  id: string;
  authorId?: string;
  content?: string;
  createdTimestamp?: number;
  reference?: FakeMessage | null;
  referenceChannelId?: string;
  channel?: FakeChannel;
  fetchError?: boolean;
}

interface FakeChannel {
  isThread: () => boolean;
  messages: {
    fetch: ReturnType<typeof vi.fn>;
  };
}

type FakeMessage = Message & { fetchReference: ReturnType<typeof vi.fn> };

function fakeChannel(thread = false, history: readonly FakeMessage[] = []): FakeChannel {
  return {
    isThread: () => thread,
    messages: {
      fetch: vi.fn().mockResolvedValue(new Map(history.map((message) => [message.id, message]))),
    },
  };
}

function fakeMessage(options: FakeMessageOptions): FakeMessage {
  const channel = options.channel ?? fakeChannel();
  const referenced = options.reference ?? null;
  const fetchReference = options.fetchError
    ? vi.fn().mockRejectedValue(new Error('Unknown message'))
    : vi.fn().mockImplementation(async () => {
        if (!referenced) {
          throw new Error('Missing reference');
        }
        return referenced;
      });

  return {
    id: options.id,
    channelId: 'channel-1',
    channel,
    author: {
      id: options.authorId ?? 'participant',
      displayAvatarURL: () =>
        `https://cdn.discordapp.com/${options.authorId ?? 'participant'}.png`,
    },
    content: options.content ?? options.id,
    createdTimestamp: options.createdTimestamp ?? 0,
    reference: referenced
      ? {
          messageId: referenced.id,
          channelId: options.referenceChannelId ?? 'channel-1',
        }
      : null,
    fetchReference,
  } as unknown as FakeMessage;
}

const resolveOptions = { botUserId: 'bot', queryingUserId: 'querying-user' };

describe('resolveDiscordContext', () => {
  it('returns an oldest-first same-channel chain and selects its oldest message as source', async () => {
    const oldest = fakeMessage({
      id: '1',
      authorId: 'participant',
      content: 'source',
      createdTimestamp: 1,
    });
    const botReply = fakeMessage({
      id: '2',
      authorId: 'bot',
      content: 'answer',
      createdTimestamp: 2,
      reference: oldest,
    });
    const userReply = fakeMessage({
      id: '3',
      authorId: 'querying-user',
      content: 'follow-up',
      createdTimestamp: 3,
      reference: botReply,
    });
    const query = fakeMessage({ id: '4', createdTimestamp: 4, reference: userReply });

    const result = await resolveDiscordContext(query, resolveOptions);

    expect(result?.source).toBe(oldest);
    expect(result?.replyTarget).toBe(userReply);
    expect(result?.turns).toEqual([
      {
        messageId: '1',
        authorId: 'participant',
        authorName: 'participant',
        authorAvatarUrl: 'https://cdn.discordapp.com/participant.png',
        role: 'participant',
        text: 'source',
        createdAt: new Date(1).toISOString(),
      },
      {
        messageId: '2',
        authorId: 'bot',
        authorName: 'bot',
        authorAvatarUrl: 'https://cdn.discordapp.com/bot.png',
        role: 'assistant',
        text: 'answer',
        createdAt: new Date(2).toISOString(),
      },
      {
        messageId: '3',
        authorId: 'querying-user',
        authorName: 'querying-user',
        authorAvatarUrl: 'https://cdn.discordapp.com/querying-user.png',
        role: 'user',
        text: 'follow-up',
        createdAt: new Date(3).toISOString(),
      },
    ]);
  });

  it('stops at the depth bound and does not fetch a seventh ancestor', async () => {
    const messages: FakeMessage[] = [];
    for (let index = 0; index <= MAX_REPLY_CHAIN_DEPTH; index += 1) {
      messages.push(
        fakeMessage({
          id: String(index),
          createdTimestamp: index,
          reference: messages[index - 1] ?? null,
        }),
      );
    }
    const query = fakeMessage({
      id: 'query',
      createdTimestamp: 100,
      reference: messages[MAX_REPLY_CHAIN_DEPTH] ?? null,
    });

    const result = await resolveDiscordContext(query, resolveOptions);

    expect(result?.turns).toHaveLength(MAX_REPLY_CHAIN_DEPTH);
    expect(result?.source?.id).toBe('1');
    expect(messages[1]?.fetchReference).not.toHaveBeenCalled();
  });

  it('is cycle-safe and returns partial context for an inaccessible ancestor', async () => {
    const inaccessible = fakeMessage({ id: 'inaccessible', fetchError: true, createdTimestamp: 1 });
    inaccessible.reference = { messageId: 'deleted', channelId: 'channel-1' } as Message['reference'];
    const middle = fakeMessage({ id: 'middle', createdTimestamp: 2, reference: inaccessible });
    const query = fakeMessage({ id: 'query', createdTimestamp: 3, reference: middle });

    const partial = await resolveDiscordContext(query, resolveOptions);

    expect(partial?.source).toBe(inaccessible);
    expect(partial?.turns.map((turn) => turn.messageId)).toEqual(['inaccessible', 'middle']);

    middle.reference = { messageId: inaccessible.id, channelId: 'channel-1' } as Message['reference'];
    inaccessible.fetchReference.mockResolvedValue(middle);
    const cyclic = await resolveDiscordContext(query, resolveOptions);

    expect(cyclic?.turns.map((turn) => turn.messageId)).toEqual(['inaccessible', 'middle']);
  });

  it('ignores a cross-channel reference and returns nothing for an empty channel', async () => {
    const parent = fakeMessage({ id: 'parent' });
    const crossChannel = fakeMessage({
      id: 'query',
      reference: parent,
      referenceChannelId: 'other-channel',
    });
    const withoutReference = fakeMessage({ id: 'query-2' });

    await expect(resolveDiscordContext(crossChannel, resolveOptions)).resolves.toBeNull();
    await expect(resolveDiscordContext(withoutReference, resolveOptions)).resolves.toBeNull();
    expect(crossChannel.fetchReference).not.toHaveBeenCalled();
  });

  it('never promotes ambient chatter to source for a self-contained question', async () => {
    const ambient = fakeMessage({ id: 'ambient', content: 'unrelated chatter', createdTimestamp: 1 });
    const channel = fakeChannel(false, [ambient]);
    const query = fakeMessage({ id: 'query', createdTimestamp: 2, channel });

    const result = await resolveDiscordContext(query, { ...resolveOptions, now: () => 2 });

    expect(result).not.toBeNull();
    expect(result?.source).toBeNull();
    expect(result?.replyTarget).toBeNull();
    expect(result?.turns.map((turn) => turn.messageId)).toEqual(['ambient']);
  });

  it('promotes ambient chatter to source only when the caller opts in', async () => {
    const ambient = fakeMessage({ id: 'ambient', content: 'unrelated chatter', createdTimestamp: 1 });
    const channel = fakeChannel(false, [ambient]);
    const query = fakeMessage({ id: 'query', createdTimestamp: 2, channel });

    const result = await resolveDiscordContext(query, {
      ...resolveOptions,
      allowAmbientSource: true,
      now: () => 2,
    });

    expect(result?.source).toBe(ambient);
  });

  it('bounds ambient context by count and drops stale messages', async () => {
    const now = 10_000_000;
    const fresh = Array.from({ length: MAX_AMBIENT_CONTEXT_MESSAGES + 3 }, (_, index) =>
      fakeMessage({
        id: `fresh-${index}`,
        content: `fresh ${index}`,
        createdTimestamp: now - 1_000 * (index + 1),
      }),
    );
    const stale = fakeMessage({
      id: 'stale',
      content: 'old topic',
      createdTimestamp: now - MAX_AMBIENT_CONTEXT_AGE_MS - 1,
    });
    const channel = fakeChannel(false, [...fresh, stale]);
    const query = fakeMessage({ id: 'query', createdTimestamp: now, channel });

    const result = await resolveDiscordContext(query, {
      ...resolveOptions,
      allowAmbientSource: true,
      now: () => now,
    });

    expect(result?.turns.length).toBeLessThanOrEqual(MAX_AMBIENT_CONTEXT_MESSAGES);
    expect(result?.turns.map((turn) => turn.messageId)).not.toContain('stale');
  });

  it('adds bounded thread history, deduplicates the chain, and excludes the query', async () => {
    const channel = fakeChannel(true);
    const source = fakeMessage({ id: 'source', createdTimestamp: 1, channel });
    const history = Array.from({ length: MAX_THREAD_CONTEXT_MESSAGES }, (_, index) =>
      fakeMessage({
        id: `history-${index}`,
        createdTimestamp: index + 2,
        channel,
      }),
    );
    const query = fakeMessage({ id: 'query', createdTimestamp: 20, reference: source, channel });
    channel.messages.fetch.mockResolvedValue(
      new Map([...history, source, query].map((message) => [message.id, message])),
    );

    const result = await resolveDiscordContext(query, resolveOptions);

    expect(channel.messages.fetch).toHaveBeenCalledWith({
      before: 'query',
      limit: MAX_THREAD_CONTEXT_MESSAGES,
      cache: false,
    });
    expect(result?.turns.map((turn) => turn.messageId)).toEqual([
      'source',
      ...history.map((message) => message.id),
    ]);
    expect(result?.turns).toHaveLength(1 + MAX_THREAD_CONTEXT_MESSAGES);
  });

  it('keeps reply context when thread history cannot be fetched and caps total text', async () => {
    const channel = fakeChannel(true);
    channel.messages.fetch.mockRejectedValue(new Error('Missing access'));
    const source = fakeMessage({
      id: 'source',
      content: 'x'.repeat(MAX_CONTEXT_CHARACTERS + 10),
      channel,
    });
    const query = fakeMessage({ id: 'query', reference: source, channel });

    const result = await resolveDiscordContext(query, resolveOptions);

    expect(result?.source).toBe(source);
    expect(result?.turns).toHaveLength(1);
    expect(result?.turns[0]?.text).toHaveLength(MAX_CONTEXT_CHARACTERS);
  });
});
