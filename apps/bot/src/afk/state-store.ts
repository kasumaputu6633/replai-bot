import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface AfkGuildState {
  guildId: string;
  channelId: string;
  updatedAt: string;
  updatedBy: string;
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
  readonly #guilds = new Map<string, AfkGuildState>();
  #writeQueue: Promise<void> = Promise.resolve();

  private constructor(filePath: string) {
    this.#filePath = filePath;
  }

  public static async open(filePath: string): Promise<AfkStateStore> {
    const store = new AfkStateStore(filePath);
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
    await this.#persist();
  }

  public async delete(guildId: string): Promise<boolean> {
    const deleted = this.#guilds.delete(guildId);
    if (deleted) {
      await this.#persist();
    }
    return deleted;
  }

  async #load(): Promise<void> {
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
