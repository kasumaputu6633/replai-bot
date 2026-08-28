import type { SourceContext } from '@replai/core';

export const DEFAULT_THREAD_MEMORY_TTL_MS = 60 * 60 * 1_000;
export const DEFAULT_MAX_THREAD_MEMORY_CONVERSATIONS = 500;
export const DEFAULT_MAX_THREAD_MEMORY_TURNS = 12;
export const DEFAULT_MAX_THREAD_MEMORY_CHARACTERS = 20_000;

export type ThreadMemoryRole = 'user' | 'assistant';

export interface ThreadMemoryTurn {
  messageId: string;
  authorId: string;
  authorName?: string | undefined;
  authorAvatarUrl?: string | undefined;
  role: ThreadMemoryRole;
  text: string;
  createdAt: string;
}

export interface ThreadMemorySnapshot {
  channelId: string;
  source: SourceContext;
  turns: ThreadMemoryTurn[];
}

export interface ThreadMemoryStoreOptions {
  ttlMs?: number;
  maxConversations?: number;
  maxTurns?: number;
  maxCharacters?: number;
  now?: () => number;
}

interface ThreadMemoryEntry {
  source: SourceContext;
  turns: ThreadMemoryTurn[];
  expiresAt: number;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
  return value;
}

function cloneTurn(turn: ThreadMemoryTurn): ThreadMemoryTurn {
  return { ...turn };
}

export class ThreadMemoryStore {
  readonly #ttlMs: number;
  readonly #maxConversations: number;
  readonly #maxTurns: number;
  readonly #maxCharacters: number;
  readonly #now: () => number;
  readonly #entries = new Map<string, ThreadMemoryEntry>();

  constructor(options: ThreadMemoryStoreOptions = {}) {
    this.#ttlMs = positiveInteger(
      options.ttlMs ?? DEFAULT_THREAD_MEMORY_TTL_MS,
      'ttlMs',
    );
    this.#maxConversations = positiveInteger(
      options.maxConversations ?? DEFAULT_MAX_THREAD_MEMORY_CONVERSATIONS,
      'maxConversations',
    );
    this.#maxTurns = positiveInteger(
      options.maxTurns ?? DEFAULT_MAX_THREAD_MEMORY_TURNS,
      'maxTurns',
    );
    this.#maxCharacters = positiveInteger(
      options.maxCharacters ?? DEFAULT_MAX_THREAD_MEMORY_CHARACTERS,
      'maxCharacters',
    );
    this.#now = options.now ?? Date.now;
  }

  get size(): number {
    this.#evictExpired(this.#now());
    return this.#entries.size;
  }

  /** Starts or explicitly resets a channel conversation. */
  set(channelId: string, source: SourceContext): ThreadMemorySnapshot {
    const now = this.#now();
    this.#evictExpired(now);
    this.#entries.delete(channelId);

    while (this.#entries.size >= this.#maxConversations) {
      const leastRecentlyUsed = this.#entries.keys().next().value as string | undefined;
      if (leastRecentlyUsed === undefined) {
        break;
      }
      this.#entries.delete(leastRecentlyUsed);
    }

    const entry: ThreadMemoryEntry = {
      source: structuredClone(source),
      turns: [],
      expiresAt: now + this.#ttlMs,
    };
    this.#entries.set(channelId, entry);
    return this.#snapshot(channelId, entry);
  }

  /** Returns a defensive snapshot and refreshes TTL/LRU state when found. */
  get(channelId: string): ThreadMemorySnapshot | null {
    const now = this.#now();
    this.#evictExpired(now);
    const entry = this.#entries.get(channelId);
    if (!entry) {
      return null;
    }

    this.#touch(channelId, entry, now);
    return this.#snapshot(channelId, entry);
  }

  /** Appends one completed user/assistant turn to an existing conversation. */
  append(channelId: string, turn: ThreadMemoryTurn): ThreadMemorySnapshot | null {
    const now = this.#now();
    this.#evictExpired(now);
    const entry = this.#entries.get(channelId);
    if (!entry) {
      return null;
    }

    const boundedTurn = cloneTurn(turn);
    boundedTurn.text = boundedTurn.text.slice(0, this.#maxCharacters);
    entry.turns.push(boundedTurn);

    let characterCount = entry.turns.reduce((total, item) => total + item.text.length, 0);
    while (entry.turns.length > this.#maxTurns || characterCount > this.#maxCharacters) {
      const removed = entry.turns.shift();
      if (!removed) {
        break;
      }
      characterCount -= removed.text.length;
    }

    this.#touch(channelId, entry, now);
    return this.#snapshot(channelId, entry);
  }

  clear(channelId?: string): void {
    if (channelId === undefined) {
      this.#entries.clear();
      return;
    }
    this.#entries.delete(channelId);
  }

  #evictExpired(now: number): void {
    for (const [channelId, entry] of this.#entries) {
      if (entry.expiresAt <= now) {
        this.#entries.delete(channelId);
      }
    }
  }

  #touch(channelId: string, entry: ThreadMemoryEntry, now: number): void {
    entry.expiresAt = now + this.#ttlMs;
    this.#entries.delete(channelId);
    this.#entries.set(channelId, entry);
  }

  #snapshot(channelId: string, entry: ThreadMemoryEntry): ThreadMemorySnapshot {
    return {
      channelId,
      source: structuredClone(entry.source),
      turns: entry.turns.map(cloneTurn),
    };
  }
}
