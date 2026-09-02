import type { ResearchInput } from '@replai/core';
import { MongoClient, type Collection, type Db, type Document } from 'mongodb';
import type { Logger } from 'pino';
import type { AfkGuildState, AfkStatePersistence } from '../afk/state-store.js';

export interface ConversationEvaluation {
  input: ResearchInput;
  response?: string | undefined;
  model: string;
  durationMs: number;
  status: 'completed' | 'failed';
  error?: string | undefined;
}

export interface EvaluationStore {
  recordConversation(evaluation: ConversationEvaluation): Promise<void>;
}

export interface MigrationCounts {
  conversationEvaluations: number;
  afkGuildStates: number;
}

function sameIndexKeys(left: Document, right: Document): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(([key, value], index) => {
      const rightEntry = rightEntries[index];
      return rightEntry?.[0] === key && rightEntry[1] === value;
    })
  );
}

export class MongoStore implements AfkStatePersistence, EvaluationStore {
  readonly #client: MongoClient;
  readonly #database: Db;
  readonly #logger: Logger;

  private constructor(client: MongoClient, database: Db, logger: Logger) {
    this.#client = client;
    this.#database = database;
    this.#logger = logger;
  }

  public static async connect(
    uri: string,
    databaseName: string,
    logger: Logger,
  ): Promise<MongoStore> {
    const client = new MongoClient(uri, { family: 0, serverSelectionTimeoutMS: 10_000 });
    try {
      await client.connect();
      const store = new MongoStore(client, client.db(databaseName), logger);
      await store.#ensureIndex(store.#afk, { guildId: 1 }, { unique: true });
      await store.#ensureIndex(store.#evaluations, { createdAt: -1 });
      await store.#ensureIndex(store.#evaluations, {
        'input.metadata.userId': 1,
        createdAt: -1,
      });
      return store;
    } catch (error) {
      await client.close().catch(() => undefined);
      throw error;
    }
  }

  get #afk(): Collection {
    return this.#database.collection('afk_guild_states');
  }

  get #evaluations(): Collection {
    return this.#database.collection('conversation_evaluations');
  }

  public async loadAfkStates(): Promise<AfkGuildState[]> {
    return this.#afk
      .find({}, { projection: { _id: 0 } })
      .map((state) => state as unknown as AfkGuildState)
      .toArray();
  }

  public async setAfkState(state: AfkGuildState): Promise<void> {
    await this.#afk.replaceOne({ guildId: state.guildId }, state, { upsert: true });
  }

  public async deleteAfkState(guildId: string): Promise<void> {
    await this.#afk.deleteOne({ guildId });
  }

  public async recordConversation(evaluation: ConversationEvaluation): Promise<void> {
    try {
      await this.#evaluations.insertOne({ ...evaluation, createdAt: new Date() });
    } catch (error) {
      this.#logger.warn({ err: error }, 'Failed to persist conversation evaluation');
    }
  }

  public async migrateFrom(uri: string, databaseName: string): Promise<MigrationCounts> {
    const source = new MongoClient(uri, { family: 0, serverSelectionTimeoutMS: 10_000 });
    try {
      await source.connect();
      const sourceDatabase = source.db(databaseName);
      const conversationEvaluations = await this.#copyCollection(
        sourceDatabase.collection('conversation_evaluations'),
        this.#evaluations,
      );
      const afkGuildStates = await this.#copyCollection(
        sourceDatabase.collection('afk_guild_states'),
        this.#afk,
      );
      return { conversationEvaluations, afkGuildStates };
    } finally {
      await source.close();
    }
  }

  async #ensureIndex(
    collection: Collection,
    keys: Document,
    options: { unique?: boolean } = {},
  ): Promise<void> {
    const indexes = await collection.listIndexes().toArray();
    if (indexes.some((index) => sameIndexKeys(index.key, keys))) return;
    await collection.createIndex(keys, options);
  }

  async #copyCollection(source: Collection, target: Collection): Promise<number> {
    const documents = await source.find({}).toArray();
    for (const document of documents) {
      await target.replaceOne({ _id: document._id }, document, { upsert: true });
    }
    return documents.length;
  }

  public async close(): Promise<void> {
    await this.#client.close();
  }
}
