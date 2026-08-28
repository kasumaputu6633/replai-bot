import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { VoiceConnectionStatus, type VoiceConnection } from '@discordjs/voice';
import type * as DiscordVoiceModule from '@discordjs/voice';
import { ChannelType, type Client } from 'discord.js';
import type { Logger } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const voiceMocks = vi.hoisted(() => ({
  entersState: vi.fn(),
  joinVoiceChannel: vi.fn(),
}));

vi.mock('@discordjs/voice', async (importOriginal) => ({
  ...(await importOriginal<typeof DiscordVoiceModule>()),
  entersState: voiceMocks.entersState,
  joinVoiceChannel: voiceMocks.joinVoiceChannel,
}));

import { AfkStateStore } from './state-store.js';
import { AfkVoiceManager } from './voice-manager.js';

function voiceConnection(): VoiceConnection {
  const connection = new EventEmitter() as VoiceConnection;
  Object.defineProperty(connection, 'state', {
    configurable: true,
    writable: true,
    value: { status: VoiceConnectionStatus.Ready },
  });
  connection.destroy = vi.fn(() => {
    const oldState = connection.state;
    Object.defineProperty(connection, 'state', {
      configurable: true,
      writable: true,
      value: { status: VoiceConnectionStatus.Destroyed },
    });
    connection.emit(VoiceConnectionStatus.Destroyed, oldState, connection.state);
  });
  return connection;
}

function discordClient(): Client {
  const guild = (guildId: string, channelId: string) => {
    const guildValue = {
      id: guildId,
      voiceAdapterCreator: vi.fn(),
    };
    return {
      ...guildValue,
      channels: {
        fetch: vi.fn().mockResolvedValue({
          id: channelId,
          guildId,
          guild: guildValue,
          type: ChannelType.GuildVoice,
        }),
      },
    };
  };
  const guilds = new Map([
    ['guild-1', guild('guild-1', 'voice-1')],
    ['guild-2', guild('guild-2', 'voice-2')],
  ]);
  return {
    guilds: {
      cache: guilds,
      fetch: vi.fn(async (guildId: string) => guilds.get(guildId)),
    },
  } as unknown as Client;
}

function logger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger;
}

beforeEach(() => {
  vi.useFakeTimers();
  voiceMocks.entersState.mockReset().mockResolvedValue(undefined);
  voiceMocks.joinVoiceChannel.mockReset().mockImplementation(() => voiceConnection());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AfkVoiceManager', () => {
  it('restores every configured guild and rejoins after a disconnect', async () => {
    const filePath = join(
      process.env.TMPDIR ?? '/tmp',
      `replai-afk-voice-${process.pid}-${Date.now()}.json`,
    );
    const store = await AfkStateStore.open(filePath);
    await store.set({
      guildId: 'guild-1',
      channelId: 'voice-1',
      updatedBy: 'admin',
      updatedAt: new Date().toISOString(),
    });
    await store.set({
      guildId: 'guild-2',
      channelId: 'voice-2',
      updatedBy: 'admin',
      updatedAt: new Date().toISOString(),
    });
    const manager = new AfkVoiceManager(discordClient(), store, logger());

    await manager.restore();

    expect(voiceMocks.joinVoiceChannel).toHaveBeenCalledTimes(2);
    expect(voiceMocks.joinVoiceChannel).toHaveBeenCalledWith(
      expect.objectContaining({ selfDeaf: true, selfMute: true }),
    );
    expect(manager.status('guild-1')).toMatchObject({
      configured: true,
      connected: true,
      channelId: 'voice-1',
    });

    const firstConnection = voiceMocks.joinVoiceChannel.mock.results[0]?.value as VoiceConnection;
    Object.defineProperty(firstConnection, 'state', {
      configurable: true,
      writable: true,
      value: { status: VoiceConnectionStatus.Disconnected },
    });
    firstConnection.emit(VoiceConnectionStatus.Disconnected, {}, firstConnection.state);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(voiceMocks.joinVoiceChannel).toHaveBeenCalledTimes(3);
    manager.shutdown();
  });
});
