import {
  entersState,
  joinVoiceChannel,
  VoiceConnectionStatus,
  type VoiceConnection,
} from '@discordjs/voice';
import { ChannelType, type Client, type VoiceBasedChannel } from 'discord.js';
import type { Logger } from 'pino';
import type { AfkGuildState, AfkStateStore } from './state-store.js';

const READY_TIMEOUT_MS = 15_000;
const RECONNECT_DELAY_MS = 10_000;

export interface AfkVoiceStatus {
  configured: boolean;
  connected: boolean;
  channelId?: string | undefined;
}

export interface AfkVoiceService {
  configure(guildId: string, channelId: string, updatedBy: string): Promise<boolean>;
  stop(guildId: string): Promise<boolean>;
  status(guildId: string): AfkVoiceStatus;
}

export class AfkVoiceManager implements AfkVoiceService {
  readonly #client: Client;
  readonly #store: AfkStateStore;
  readonly #logger: Logger;
  readonly #connections = new Map<string, VoiceConnection>();
  readonly #reconnectTimers = new Map<string, NodeJS.Timeout>();
  #shuttingDown = false;

  public constructor(client: Client, store: AfkStateStore, logger: Logger) {
    this.#client = client;
    this.#store = store;
    this.#logger = logger;
  }

  public async restore(): Promise<void> {
    const results = await Promise.allSettled(
      this.#store.values().map(async (state) => {
        try {
          await this.#connect(state);
        } catch (error) {
          this.#scheduleReconnect(state.guildId);
          throw error;
        }
      }),
    );
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed > 0) {
      this.#logger.warn({ failed }, 'Some AFK voice connections will retry');
    }
  }

  public async configure(
    guildId: string,
    channelId: string,
    updatedBy: string,
  ): Promise<boolean> {
    const state: AfkGuildState = {
      guildId,
      channelId,
      updatedBy,
      updatedAt: new Date().toISOString(),
    };
    await this.#store.set(state);
    this.#clearReconnect(guildId);
    try {
      await this.#connect(state);
      return true;
    } catch (error) {
      this.#logger.warn({ err: error, guildId, channelId }, 'AFK voice join will retry');
      this.#scheduleReconnect(guildId);
      return false;
    }
  }

  public async stop(guildId: string): Promise<boolean> {
    this.#clearReconnect(guildId);
    const deleted = await this.#store.delete(guildId);
    const connection = this.#connections.get(guildId);
    this.#connections.delete(guildId);
    if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
      connection.destroy();
    }
    return deleted || Boolean(connection);
  }

  public status(guildId: string): AfkVoiceStatus {
    const state = this.#store.get(guildId);
    return {
      configured: Boolean(state),
      connected:
        this.#connections.get(guildId)?.state.status === VoiceConnectionStatus.Ready,
      ...(state ? { channelId: state.channelId } : {}),
    };
  }

  public shutdown(): void {
    this.#shuttingDown = true;
    for (const timer of this.#reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.#reconnectTimers.clear();
    for (const connection of this.#connections.values()) {
      if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
        connection.destroy();
      }
    }
    this.#connections.clear();
  }

  async #connect(state: AfkGuildState): Promise<void> {
    const guild =
      this.#client.guilds.cache.get(state.guildId) ??
      (await this.#client.guilds.fetch(state.guildId));
    const channel = await guild.channels.fetch(state.channelId);
    if (
      !channel ||
      (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)
    ) {
      throw new Error('Configured AFK channel is unavailable or is not voice-based.');
    }

    const existing = this.#connections.get(state.guildId);
    if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) {
      existing.destroy();
    }

    const connection = this.#join(channel);
    this.#connections.set(state.guildId, connection);
    connection.on('error', (error) => {
      this.#logger.warn({ err: error, guildId: state.guildId }, 'AFK voice connection error');
    });
    connection.on(VoiceConnectionStatus.Disconnected, () => {
      this.#scheduleReconnect(state.guildId);
    });
    connection.on(VoiceConnectionStatus.Destroyed, () => {
      if (this.#connections.get(state.guildId) === connection) {
        this.#connections.delete(state.guildId);
      }
      this.#scheduleReconnect(state.guildId);
    });

    await entersState(connection, VoiceConnectionStatus.Ready, READY_TIMEOUT_MS);
    this.#clearReconnect(state.guildId);
    this.#logger.info(
      { guildId: state.guildId, channelId: state.channelId },
      'AFK voice connection ready',
    );
  }

  #join(channel: VoiceBasedChannel): VoiceConnection {
    return joinVoiceChannel({
      guildId: channel.guildId,
      channelId: channel.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: true,
    });
  }

  #scheduleReconnect(guildId: string): void {
    if (
      this.#shuttingDown ||
      this.#reconnectTimers.has(guildId) ||
      !this.#store.get(guildId)
    ) {
      return;
    }
    const timer = setTimeout(() => {
      this.#reconnectTimers.delete(guildId);
      const state = this.#store.get(guildId);
      const connection = this.#connections.get(guildId);
      if (!state || connection?.state.status === VoiceConnectionStatus.Ready) {
        return;
      }
      void this.#connect(state).catch((error: unknown) => {
        this.#logger.warn(
          { err: error, guildId, channelId: state.channelId },
          'AFK voice reconnect failed',
        );
        this.#scheduleReconnect(guildId);
      });
    }, RECONNECT_DELAY_MS);
    timer.unref();
    this.#reconnectTimers.set(guildId, timer);
  }

  #clearReconnect(guildId: string): void {
    const timer = this.#reconnectTimers.get(guildId);
    if (timer) {
      clearTimeout(timer);
      this.#reconnectTimers.delete(guildId);
    }
  }
}
