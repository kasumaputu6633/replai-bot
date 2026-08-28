import { ChannelType, PermissionFlagsBits, type Interaction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { AfkVoiceService } from '../afk/voice-manager.js';
import { AFK_COMMAND, handleAfkInteraction } from './afk.js';

function afkService(): AfkVoiceService {
  return {
    configure: vi.fn().mockResolvedValue(true),
    stop: vi.fn().mockResolvedValue(true),
    status: vi.fn().mockReturnValue({ configured: false, connected: false }),
  };
}

function interaction(options: {
  channel?: boolean;
  stop?: boolean;
  manageGuild?: boolean;
} = {}): Interaction & {
  reply: ReturnType<typeof vi.fn>;
  deferReply: ReturnType<typeof vi.fn>;
  editReply: ReturnType<typeof vi.fn>;
} {
  const channel = options.channel
    ? {
        id: 'voice-1',
        guildId: 'guild-1',
        type: ChannelType.GuildVoice,
        permissionsFor: () => ({ has: () => true }),
        toString: () => '<#voice-1>',
      }
    : null;
  const reply = vi.fn().mockResolvedValue(undefined);
  const deferReply = vi.fn();
  const editReply = vi.fn().mockResolvedValue(undefined);
  const fake = {
    id: 'interaction-1',
    commandName: 'afk',
    guildId: 'guild-1',
    deferred: false,
    replied: false,
    user: { id: 'admin-1' },
    guild: { members: { me: { id: 'bot' } } },
    memberPermissions: {
      has: (permission: bigint) =>
        permission === PermissionFlagsBits.ManageGuild && options.manageGuild !== false,
    },
    options: {
      getChannel: () => channel,
      getBoolean: () => options.stop ?? null,
    },
    isChatInputCommand: () => true,
    inCachedGuild: () => true,
    reply,
    deferReply,
    editReply,
  };
  deferReply.mockImplementation(async () => {
    fake.deferred = true;
  });
  return fake as unknown as ReturnType<typeof interaction>;
}

describe('/afk', () => {
  it('uses Discord voice-channel selection and Manage Server permission', () => {
    const command = AFK_COMMAND.toJSON();
    expect(command.default_member_permissions).toBe(
      PermissionFlagsBits.ManageGuild.toString(),
    );
    expect(command.options?.[0]).toMatchObject({
      name: 'channel',
      channel_types: [ChannelType.GuildVoice, ChannelType.GuildStageVoice],
    });
  });

  it('configures AFK independently for the interaction guild', async () => {
    const service = afkService();
    const current = interaction({ channel: true });

    await handleAfkInteraction(current, service);

    expect(service.configure).toHaveBeenCalledWith('guild-1', 'voice-1', 'admin-1');
    expect(current.deferReply).toHaveBeenCalledOnce();
    expect(current.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('restart') }),
    );
  });

  it('stops only the current guild and rejects unauthorized members', async () => {
    const service = afkService();
    await handleAfkInteraction(interaction({ stop: true }), service);
    expect(service.stop).toHaveBeenCalledWith('guild-1');

    const unauthorized = interaction({ channel: true, manageGuild: false });
    await handleAfkInteraction(unauthorized, service);
    expect(service.configure).not.toHaveBeenCalled();
    expect(unauthorized.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Manage Server') }),
    );
  });
});
