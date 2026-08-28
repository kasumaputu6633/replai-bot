import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AfkStateStore } from './state-store.js';

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
});
