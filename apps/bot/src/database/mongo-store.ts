import type { ResearchInput } from '@replai/core';
import { MongoClient, type Collection, type Db } from 'mongodb';
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
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5_000 });
    await client.connect();
    const store = new MongoStore(client, client.db(databaseName), logger);
    await store.#afk.createIndex({ guildId: 1 }, { unique: true });
    await store.#evaluations.createIndex({ createdAt: -1 });
    await store.#evaluations.createIndex({ 'input.metadata.userId': 1, createdAt: -1 });
    return store;
  }

  get #afk(): Collection<AfkGuildState> {
    return this.#database.collection<AfkGuildState>('afk_guild_states');
  }

  get #evaluations(): Collection {
    return this.#database.collection('conversation_evaluations');
  }

  public async loadAfkStates(): Promise<AfkGuildState[]> {
    return this.#afk.find({}, { projection: { _id: 0 } }).toArray();
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

  public async close(): Promise<void> {
    await this.#client.close();
  }
}
