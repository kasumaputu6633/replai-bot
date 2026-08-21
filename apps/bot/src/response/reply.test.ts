import { MessageFlags, type Message } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { DISCORD_SAFE_MESSAGE_LENGTH } from './split-message.js';
import { replyWithLongMessage } from './reply.js';

describe('replyWithLongMessage', () => {
  it('returns the first message and suppresses mentions in every chunk', async () => {
    const firstMessage = { id: 'assistant-1' } as Message;
    const reply = vi.fn().mockResolvedValue(firstMessage);
    const send = vi.fn().mockResolvedValue({ id: 'assistant-2' });
    const message = {
      reply,
      channel: {
        isSendable: () => true,
        send,
      },
    } as unknown as Message;

    const result = await replyWithLongMessage(
      message,
      `<@123> ${'x'.repeat(DISCORD_SAFE_MESSAGE_LENGTH * 2)}`,
    );

    expect(result).toBe(firstMessage);
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedMentions: { parse: [], repliedUser: false },
        flags: MessageFlags.SuppressEmbeds,
      }),
    );
    expect(send).toHaveBeenCalled();
    for (const [options] of send.mock.calls) {
      expect(options).toEqual(
        expect.objectContaining({
          allowedMentions: { parse: [], repliedUser: false },
          flags: MessageFlags.SuppressEmbeds,
        }),
      );
    }
  });
});
