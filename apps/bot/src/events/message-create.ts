import {
  assessResearchQuestion,
  buildResearchGuardRefusal,
  MAX_RESEARCH_PARTICIPANTS,
  research,
  type ResearchInput,
  type ResearchParticipant,
  type ResearchProvider,
  type SourceContext,
} from '@replai/core';
import { Events, MessageFlags, type Client, type Message } from 'discord.js';
import type { Logger } from 'pino';
import { normalizeDiscordMessage } from '../discord/normalize-message.js';
import { DEFAULT_QUESTION, parseQuestion } from '../discord/parse-question.js';
import {
  parseResearchRequest,
  type ResearchContextTurn,
} from '../discord/parse-research-request.js';
import { resolveDiscordContext } from '../discord/resolve-context.js';
import type {
  ThreadMemoryStore,
  ThreadMemorySnapshot,
  ThreadMemoryTurn,
} from '../memory/thread-memory.js';
import { replyWithLongMessage, withTyping } from '../response/reply.js';

const MISSING_REFERENCE_RESPONSE = 'Reply to a message and mention me with your question.';
const INACCESSIBLE_REFERENCE_RESPONSE = "I couldn't access the message you're replying to.";
const RESEARCH_FAILURE_RESPONSE = "I couldn't complete the research request. Please try again.";

export interface MessageCreateDependencies {
  client: Client;
  configuredClientId: string;
  provider: ResearchProvider;
  logger: Logger;
  model: string;
  threadMemory: ThreadMemoryStore;
}

async function replySafely(message: Message, content: string, logger: Logger): Promise<void> {
  try {
    await message.reply({
      content,
      allowedMentions: { parse: [], repliedUser: false },
      flags: MessageFlags.SuppressEmbeds,
    });
  } catch (error) {
    logger.error({ err: error, messageId: message.id }, 'Failed to send Discord response');
  }
}

function isStoredConversationSource(
  sourceMessageId: string,
  memory: ThreadMemorySnapshot,
): boolean {
  return (
    memory.source.messageId === sourceMessageId ||
    memory.turns.some((turn) => turn.messageId === sourceMessageId)
  );
}

function hasStandaloneEvidence(source: SourceContext): boolean {
  return (
    source.urls.length > 0 ||
    source.images.length > 0 ||
    source.attachments.length > 0 ||
    source.embeds.length > 0
  );
}

function mentionedParticipants(message: Message, botUserId: string): ResearchParticipant[] {
  return [...message.mentions.users.values()]
    .filter((user) => user.id !== botUserId)
    .slice(0, MAX_RESEARCH_PARTICIPANTS)
    .map((user) => ({
      id: user.id,
      name: (
        message.mentions.members?.get(user.id)?.displayName ??
        message.guild?.members.cache.get(user.id)?.displayName ??
        user.displayName ??
        user.globalName ??
        user.username ??
        user.id
      ).slice(0, 100),
      avatarUrl: user.displayAvatarURL({ extension: 'png', size: 256 }),
    }));
}

function buildResearchInput(
  question: string,
  source: SourceContext,
  resolvedTurns: readonly ResearchContextTurn[],
  memory: ThreadMemorySnapshot | null,
  message: Message,
  botUserId: string,
): ResearchInput {
  const input = parseResearchRequest({
    question,
    source,
    contextTurns: [...(memory?.turns ?? []), ...resolvedTurns],
  });

  return {
    ...input,
    metadata: {
      guildId: message.guildId ?? undefined,
      channelId: message.channelId,
      sourceMessageId: source.messageId,
      queryMessageId: message.id,
      userId: message.author.id,
      speakerName:
        message.member?.displayName ??
        message.author.displayName ??
        message.author.globalName ??
        message.author.username ??
        message.author.id,
      speakerAvatarUrl: message.author.displayAvatarURL({ extension: 'png', size: 256 }),
      mentionedUsers: mentionedParticipants(message, botUserId),
    },
  };
}

function storeDeliveredInteraction(
  memoryStore: ThreadMemoryStore,
  channelId: string,
  source: SourceContext,
  userTurn: ThreadMemoryTurn,
  assistantTurn: ThreadMemoryTurn,
): void {
  const current = memoryStore.get(channelId);
  if (current?.source.messageId !== source.messageId) {
    memoryStore.set(channelId, source);
  }
  memoryStore.append(channelId, userTurn);
  memoryStore.append(channelId, assistantTurn);
}

export async function handleMessageCreate(
  message: Message,
  dependencies: MessageCreateDependencies,
): Promise<void> {
  if (message.author.bot) {
    return;
  }

  const botUserId = dependencies.client.user?.id ?? dependencies.configuredClientId;
  const botRoleIds = message.mentions.roles
    .filter((role) => role.tags?.botId === botUserId)
    .map((role) => role.id);

  if (!message.mentions.users.has(botUserId) && botRoleIds.length === 0) {
    return;
  }

  const isThread = message.channel.isThread();
  const existingMemory = isThread ? dependencies.threadMemory.get(message.channelId) : null;
  const question = parseQuestion(message.content, botUserId, botRoleIds);
  const normalizedDirectSource = !message.reference?.messageId
    ? normalizeDiscordMessage(message)
    : null;
  const directSource =
    normalizedDirectSource &&
    (hasStandaloneEvidence(normalizedDirectSource) ||
      (!existingMemory && question !== DEFAULT_QUESTION))
      ? { ...normalizedDirectSource, text: question }
      : null;

  const guardDecision = assessResearchQuestion(question);
  if (!guardDecision.allowed) {
    dependencies.logger.warn(
      {
        guildId: message.guildId,
        channelId: message.channelId,
        messageId: message.id,
        userId: message.author.id,
        guardReason: guardDecision.reason,
      },
      'Research request blocked by input guard',
    );
    await replySafely(
      message,
      buildResearchGuardRefusal(question, guardDecision.reason),
      dependencies.logger,
    );
    return;
  }

  const resolved = await resolveDiscordContext(message, {
    botUserId,
    queryingUserId: message.author.id,
  });

  if (message.reference?.messageId && !resolved) {
    await replySafely(message, INACCESSIBLE_REFERENCE_RESPONSE, dependencies.logger);
    return;
  }

  const resolvedSource = resolved ? normalizeDiscordMessage(resolved.source) : directSource;
  const memory =
    existingMemory &&
    (!resolvedSource || isStoredConversationSource(resolvedSource.messageId, existingMemory))
      ? existingMemory
      : null;
  const source =
    memory?.source ??
    resolvedSource ??
    (normalizedDirectSource ? { ...normalizedDirectSource, text: question } : null);

  if (!source) {
    await replySafely(message, MISSING_REFERENCE_RESPONSE, dependencies.logger);
    return;
  }
  const input = buildResearchInput(
    question,
    source,
    resolved?.turns ?? [],
    memory,
    message,
    botUserId,
  );

  const startedAt = performance.now();

  try {
    const result = await withTyping(message, dependencies.logger, async () => {
      return research(dependencies.provider, input);
    });

    const assistantMessage = await replyWithLongMessage(message, result.content);
    if (isThread) {
      storeDeliveredInteraction(
        dependencies.threadMemory,
        message.channelId,
        source,
        {
          messageId: message.id,
          authorId: message.author.id,
          authorName:
            message.member?.displayName ??
            message.author.displayName ??
            message.author.globalName ??
            message.author.username ??
            message.author.id,
          authorAvatarUrl: message.author.displayAvatarURL({ extension: 'png', size: 256 }),
          role: 'user',
          text: question,
          createdAt: new Date(message.createdTimestamp).toISOString(),
        },
        {
          messageId: assistantMessage.id,
          authorId: assistantMessage.author.id,
          authorName:
            assistantMessage.member?.displayName ??
            assistantMessage.author.displayName ??
            assistantMessage.author.globalName ??
            assistantMessage.author.username ??
            assistantMessage.author.id,
          authorAvatarUrl: assistantMessage.author.displayAvatarURL({
            extension: 'png',
            size: 256,
          }),
          role: 'assistant',
          text: result.content,
          createdAt: new Date(assistantMessage.createdTimestamp).toISOString(),
        },
      );
    }
    dependencies.logger.info(
      {
        guildId: message.guildId,
        channelId: message.channelId,
        messageId: message.id,
        userId: message.author.id,
        model: dependencies.model,
        durationMs: Math.round(performance.now() - startedAt),
      },
      'Research request completed',
    );
  } catch (error) {
    dependencies.logger.error(
      {
        err: error,
        guildId: message.guildId,
        channelId: message.channelId,
        messageId: message.id,
        userId: message.author.id,
        model: dependencies.model,
        durationMs: Math.round(performance.now() - startedAt),
      },
      'Research request failed',
    );
    await replySafely(message, RESEARCH_FAILURE_RESPONSE, dependencies.logger);
  }
}

export function registerMessageCreateHandler(dependencies: MessageCreateDependencies): void {
  dependencies.client.on(Events.MessageCreate, (message) => {
    void handleMessageCreate(message, dependencies);
  });
}
