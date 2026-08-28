import {
  ChannelType,
  Events,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
  type Interaction,
} from 'discord.js';
import type { Logger } from 'pino';
import type { AfkVoiceService } from '../afk/voice-manager.js';

export const AFK_COMMAND_NAME = 'afk';

export const AFK_COMMAND = new SlashCommandBuilder()
  .setName(AFK_COMMAND_NAME)
  .setDescription('Atur bot diam di voice channel server ini')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addChannelOption((option) =>
    option
      .setName('channel')
      .setDescription('Voice channel AFK (nama channel otomatis dicari Discord)')
      .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice),
  )
  .addBooleanOption((option) =>
    option.setName('stop').setDescription('Keluar dan hapus AFK otomatis untuk server ini'),
  );

export async function registerAfkApplicationCommand(
  client: Client<true>,
  logger: Logger,
): Promise<void> {
  const commands = await client.application.commands.fetch();
  const existing = commands.find((command) => command.name === AFK_COMMAND_NAME);
  if (existing) {
    await client.application.commands.edit(existing.id, AFK_COMMAND);
  } else {
    await client.application.commands.create(AFK_COMMAND);
  }
  logger.info({ command: AFK_COMMAND_NAME }, 'Global AFK command registered');
}

async function respond(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content });
    return;
  }
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

export async function handleAfkInteraction(
  interaction: Interaction,
  afkVoice: AfkVoiceService,
): Promise<boolean> {
  if (!interaction.isChatInputCommand() || interaction.commandName !== AFK_COMMAND_NAME) {
    return false;
  }
  if (!interaction.inCachedGuild()) {
    await respond(interaction, 'Command ini cuma bisa dipakai di server.');
    return true;
  }
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await respond(interaction, 'Kamu perlu izin **Manage Server** untuk mengatur AFK bot.');
    return true;
  }

  const channel = interaction.options.getChannel('channel');
  const shouldStop = interaction.options.getBoolean('stop') ?? false;
  if (channel && shouldStop) {
    await respond(interaction, 'Pilih salah satu: tentukan `channel` atau gunakan `stop`.');
    return true;
  }

  if (shouldStop) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const stopped = await afkVoice.stop(interaction.guildId);
    await respond(
      interaction,
      stopped
        ? 'AFK dimatikan. Bot sudah keluar dan tidak akan join lagi setelah restart.'
        : 'AFK memang belum aktif di server ini.',
    );
    return true;
  }

  if (!channel) {
    const status = afkVoice.status(interaction.guildId);
    await respond(
      interaction,
      status.configured
        ? `AFK aktif di <#${status.channelId}> (${status.connected ? 'tersambung' : 'sedang reconnect'}).`
        : 'AFK belum aktif. Pakai `/afk channel:<voice-channel>` untuk mengaktifkannya.',
    );
    return true;
  }

  if (
    channel.guildId !== interaction.guildId ||
    (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)
  ) {
    await respond(interaction, 'Pilih voice channel dari server ini.');
    return true;
  }
  const botMember = interaction.guild.members.me;
  const permissions = botMember ? channel.permissionsFor(botMember) : null;
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])) {
    await respond(interaction, 'Bot perlu izin **View Channel** dan **Connect** di channel itu.');
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const connected = await afkVoice.configure(
    interaction.guildId,
    channel.id,
    interaction.user.id,
  );
  await respond(
    interaction,
    connected
      ? `AFK aktif di ${channel}. Bot akan join lagi otomatis setelah restart.`
      : `Channel ${channel} sudah disimpan. Bot belum berhasil masuk dan akan mencoba reconnect otomatis.`,
  );
  return true;
}

export function registerAfkInteractionHandler(
  client: Client,
  afkVoice: AfkVoiceService,
  logger: Logger,
): void {
  client.on(Events.InteractionCreate, (interaction) => {
    void handleAfkInteraction(interaction, afkVoice).catch((error: unknown) => {
      logger.error(
        { err: error, interactionId: interaction.id, guildId: interaction.guildId },
        'AFK command failed',
      );
      if (interaction.isChatInputCommand()) {
        void respond(interaction, 'Gagal mengatur AFK. Coba lagi sebentar.').catch(
          (replyError: unknown) => {
            logger.error({ err: replyError }, 'Failed to send AFK command error');
          },
        );
      }
    });
  });
}
