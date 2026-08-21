import type { SourceContext } from '@replai/core';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_THREAD_MEMORY_CHARACTERS,
  DEFAULT_MAX_THREAD_MEMORY_CONVERSATIONS,
  DEFAULT_MAX_THREAD_MEMORY_TURNS,
  DEFAULT_THREAD_MEMORY_TTL_MS,
  ThreadMemoryStore,
  type ThreadMemoryTurn,
} from './thread-memory.js';

function source(messageId: string): SourceContext {
  return {
    messageId,
    text: `source ${messageId}`,
    urls: [],
    images: [],
    attachments: [],
    embeds: [],
  };
}

function turn(index: number, text = `turn ${index}`): ThreadMemoryTurn {
  return {
    messageId: `message-${index}`,
    authorId: index % 2 === 0 ? 'bot' : 'user',
    role: index % 2 === 0 ? 'assistant' : 'user',
    text,
    createdAt: new Date(index).toISOString(),
  };
}

describe('ThreadMemoryStore', () => {
  it('exports the requested production defaults', () => {
    expect(DEFAULT_THREAD_MEMORY_TTL_MS).toBe(15 * 60 * 1_000);
    expect(DEFAULT_MAX_THREAD_MEMORY_CONVERSATIONS).toBe(500);
    expect(DEFAULT_MAX_THREAD_MEMORY_TURNS).toBe(8);
    expect(DEFAULT_MAX_THREAD_MEMORY_CHARACTERS).toBe(12_000);
  });

  it('stores the original source and returns defensive snapshots', () => {
    const store = new ThreadMemoryStore();
    const original = source('source-1');
    const initial = store.set('thread-1', original);
    original.text = 'mutated outside';
    initial.source.text = 'mutated snapshot';

    const appended = store.append('thread-1', turn(1));
    expect(appended?.source.text).toBe('source source-1');
    expect(appended?.turns).toEqual([turn(1)]);

    appended?.turns.push(turn(2));
    if (appended) {
      appended.turns[0]!.text = 'mutated turn';
    }

    expect(store.get('thread-1')).toEqual({
      channelId: 'thread-1',
      source: source('source-1'),
      turns: [turn(1)],
    });
  });

  it('refreshes TTL on successful reads and appends but not missing appends', () => {
    let now = 0;
    const store = new ThreadMemoryStore({ ttlMs: 10, now: () => now });
    store.set('thread-1', source('source-1'));

    now = 9;
    expect(store.get('thread-1')).not.toBeNull();
    now = 18;
    expect(store.append('thread-1', turn(1))).not.toBeNull();
    now = 27;
    expect(store.get('thread-1')).not.toBeNull();
    expect(store.append('missing', turn(2))).toBeNull();
    now = 37;
    expect(store.get('thread-1')).toBeNull();
  });

  it('evicts expired entries and the least recently used live entry', () => {
    let now = 0;
    const store = new ThreadMemoryStore({
      ttlMs: 100,
      maxConversations: 2,
      now: () => now,
    });
    store.set('a', source('a'));
    now = 1;
    store.set('b', source('b'));
    now = 2;
    store.get('a');
    now = 3;
    store.set('c', source('c'));

    expect(store.get('b')).toBeNull();
    expect(store.get('a')).not.toBeNull();
    expect(store.get('c')).not.toBeNull();

    now = 104;
    expect(store.size).toBe(0);
  });

  it('retains only the newest turns within turn and total-character bounds', () => {
    const store = new ThreadMemoryStore({ maxTurns: 3, maxCharacters: 10 });
    store.set('thread-1', source('source-1'));
    store.append('thread-1', turn(1, '1111'));
    store.append('thread-1', turn(2, '2222'));
    store.append('thread-1', turn(3, '3333'));
    const snapshot = store.append('thread-1', turn(4, '4444'));

    expect(snapshot?.turns.map((item) => item.text)).toEqual(['3333', '4444']);
    expect(snapshot?.turns.reduce((total, item) => total + item.text.length, 0)).toBeLessThanOrEqual(
      10,
    );

    const oversized = store.append('thread-1', turn(5, 'x'.repeat(20)));
    expect(oversized?.turns).toEqual([turn(5, 'x'.repeat(10))]);
  });

  it('supports clearing one conversation or the entire store and explicit reset', () => {
    const store = new ThreadMemoryStore();
    store.set('a', source('original'));
    store.append('a', turn(1));
    store.set('a', source('replacement'));
    store.set('b', source('b'));

    expect(store.get('a')?.source.messageId).toBe('replacement');
    expect(store.get('a')?.turns).toEqual([]);

    store.clear('a');
    expect(store.get('a')).toBeNull();
    expect(store.size).toBe(1);

    store.clear();
    expect(store.size).toBe(0);
  });

  it('rejects invalid bounds', () => {
    expect(() => new ThreadMemoryStore({ ttlMs: 0 })).toThrow(RangeError);
    expect(() => new ThreadMemoryStore({ maxConversations: 1.5 })).toThrow(RangeError);
    expect(() => new ThreadMemoryStore({ maxTurns: -1 })).toThrow(RangeError);
    expect(() => new ThreadMemoryStore({ maxCharacters: Number.MAX_VALUE })).toThrow(RangeError);
  });
});
