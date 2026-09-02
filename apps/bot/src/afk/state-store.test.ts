import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AfkStateStore, type AfkStatePersistence } from './state-store.js';

describe('AfkStateStore', () => {
  it('persists independent AFK channels for multiple guilds and reloads them', async () => {
    const filePath = join(
      process.env.TMPDIR ?? '/tmp',
      `replai-afk-${process.pid}-${Date.now()}.json`,
    );
    const store = await AfkStateStore.open(filePath);
    await store.set({
      guildId: 'guild-2',
      channelId: 'voice-2',
      updatedBy: 'admin-2',
      updatedAt: '2026-08-28T02:00:00.000Z',
    });
    await store.set({
      guildId: 'guild-1',
      channelId: 'voice-1',
      updatedBy: 'admin-1',
      updatedAt: '2026-08-28T01:00:00.000Z',
    });

    const reloaded = await AfkStateStore.open(filePath);
    expect(reloaded.get('guild-1')).toMatchObject({ channelId: 'voice-1' });
    expect(reloaded.get('guild-2')).toMatchObject({ channelId: 'voice-2' });
    expect(JSON.parse(await readFile(filePath, 'utf8')).guilds.map(
      (state: { guildId: string }) => state.guildId,
    )).toEqual(['guild-1', 'guild-2']);

    await reloaded.delete('guild-1');
    expect((await AfkStateStore.open(filePath)).get('guild-1')).toBeNull();
    expect((await AfkStateStore.open(filePath)).get('guild-2')).not.toBeNull();
  });

  it('starts empty when the state file does not exist', async () => {
    const filePath = join(
      process.env.TMPDIR ?? '/tmp',
      `replai-afk-missing-${process.pid}-${Date.now()}.json`,
    );
    const store = await AfkStateStore.open(filePath);
    expect(store.values()).toEqual([]);
  });

  it('loads and updates AFK state through configured persistence', async () => {
    const persisted = {
      guildId: 'mongo-guild',
      channelId: 'mongo-voice',
      updatedBy: 'owner',
      updatedAt: '2026-09-02T00:00:00.000Z',
    };
    const persistence: AfkStatePersistence = {
      loadAfkStates: vi.fn().mockResolvedValue([persisted]),
      setAfkState: vi.fn().mockResolvedValue(undefined),
      deleteAfkState: vi.fn().mockResolvedValue(undefined),
    };
    const filePath = join(
      process.env.TMPDIR ?? '/tmp',
      `replai-afk-mongo-${process.pid}-${Date.now()}.json`,
    );
    const store = await AfkStateStore.open(filePath, persistence);

    expect(store.get('mongo-guild')).toEqual(persisted);
    await store.set({ ...persisted, channelId: 'new-voice' });
    expect(persistence.setAfkState).toHaveBeenCalledWith({
      ...persisted,
      channelId: 'new-voice',
    });
    await store.delete('mongo-guild');
    expect(persistence.deleteAfkState).toHaveBeenCalledWith('mongo-guild');
  });
});
