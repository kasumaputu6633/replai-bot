import type { Logger } from 'pino';
import { MessageFlags, type Message } from 'discord.js';
import { splitDiscordMessage } from './split-message.js';

const TYPING_REFRESH_INTERVAL_MS = 8_000;

async function sendTyping(message: Message, logger: Logger): Promise<void> {
  if (!message.channel.isSendable()) {
    return;
  }

  try {
    await message.channel.sendTyping();
  } catch (error) {
    logger.debug({ err: error, channelId: message.channelId }, 'Unable to send typing indicator');
  }
}

export async function withTyping<T>(
  message: Message,
  logger: Logger,
  operation: () => Promise<T>,
): Promise<T> {
  await sendTyping(message, logger);
  const timer = setInterval(() => {
    void sendTyping(message, logger);
  }, TYPING_REFRESH_INTERVAL_MS);
  timer.unref();

  try {
    return await operation();
  } finally {
    clearInterval(timer);
  }
}

export async function replyWithLongMessage(message: Message, content: string): Promise<Message> {
  const chunks = splitDiscordMessage(content);
  const firstChunk = chunks[0];

  if (!firstChunk) {
    throw new Error('Discord response content is empty.');
  }

  const firstMessage = await message.reply({
    content: firstChunk,
    allowedMentions: { parse: [], repliedUser: false },
    flags: MessageFlags.SuppressEmbeds,
  });

  if (!message.channel.isSendable()) {
    throw new Error('Discord channel is not sendable.');
  }

  for (const chunk of chunks.slice(1)) {
    await message.channel.send({
      content: chunk,
      allowedMentions: { parse: [], repliedUser: false },
      flags: MessageFlags.SuppressEmbeds,
    });
  }

  return firstMessage;
}
