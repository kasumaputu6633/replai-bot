import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface AfkGuildState {
  guildId: string;
  channelId: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AfkStatePersistence {
  loadAfkStates(): Promise<AfkGuildState[]>;
  setAfkState(state: AfkGuildState): Promise<void>;
  deleteAfkState(guildId: string): Promise<void>;
}

interface PersistedAfkState {
  version: 1;
  guilds: AfkGuildState[];
}

function isAfkGuildState(value: unknown): value is AfkGuildState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const state = value as Record<string, unknown>;
  return (
    typeof state.guildId === 'string' &&
    state.guildId.length > 0 &&
    typeof state.channelId === 'string' &&
    state.channelId.length > 0 &&
    typeof state.updatedAt === 'string' &&
    state.updatedAt.length > 0 &&
    typeof state.updatedBy === 'string' &&
    state.updatedBy.length > 0
  );
}

export class AfkStateStore {
  readonly #filePath: string;
  readonly #persistence: AfkStatePersistence | undefined;
  readonly #guilds = new Map<string, AfkGuildState>();
  #writeQueue: Promise<void> = Promise.resolve();

  private constructor(filePath: string, persistence?: AfkStatePersistence) {
    this.#filePath = filePath;
    this.#persistence = persistence;
  }

  public static async open(
    filePath: string,
    persistence?: AfkStatePersistence,
  ): Promise<AfkStateStore> {
    const store = new AfkStateStore(filePath, persistence);
    await store.#load();
    return store;
  }

  public get(guildId: string): AfkGuildState | null {
    const state = this.#guilds.get(guildId);
    return state ? { ...state } : null;
  }

  public values(): AfkGuildState[] {
    return [...this.#guilds.values()].map((state) => ({ ...state }));
  }

  public async set(state: AfkGuildState): Promise<void> {
    this.#guilds.set(state.guildId, { ...state });
    await Promise.all([this.#persist(), this.#persistence?.setAfkState(state)]);
  }

  public async delete(guildId: string): Promise<boolean> {
    const deleted = this.#guilds.delete(guildId);
    if (deleted) {
      await Promise.all([this.#persist(), this.#persistence?.deleteAfkState(guildId)]);
    }
    return deleted;
  }

  async #load(): Promise<void> {
    if (this.#persistence) {
      const states = await this.#persistence.loadAfkStates();
      for (const state of states) {
        if (isAfkGuildState(state)) this.#guilds.set(state.guildId, { ...state });
      }
      if (states.length > 0) return;
    }
    let raw: string;
    try {
      raw = await readFile(this.#filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }

    const parsed = JSON.parse(raw) as Partial<PersistedAfkState>;
    if (parsed.version !== 1 || !Array.isArray(parsed.guilds)) {
      throw new Error('Unsupported AFK state file format.');
    }
    for (const state of parsed.guilds) {
      if (isAfkGuildState(state)) {
        this.#guilds.set(state.guildId, { ...state });
      }
    }
    if (this.#persistence) {
      await Promise.all(this.values().map((state) => this.#persistence!.setAfkState(state)));
    }
  }

  #persist(): Promise<void> {
    const snapshot: PersistedAfkState = {
      version: 1,
      guilds: this.values().sort((left, right) => left.guildId.localeCompare(right.guildId)),
    };
    this.#writeQueue = this.#writeQueue.catch(() => undefined).then(async () => {
      await mkdir(dirname(this.#filePath), { recursive: true });
      const temporaryPath = `${this.#filePath}.${process.pid}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
      await rename(temporaryPath, this.#filePath);
    });
    return this.#writeQueue;
  }
}
