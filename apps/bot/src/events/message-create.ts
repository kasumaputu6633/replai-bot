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
import type { EvaluationStore } from '../database/mongo-store.js';
import { EVALUATION_CONTRACT_VERSION } from '../database/mongo-store.js';
import { normalizeDiscordMessage } from '../discord/normalize-message.js';
import {
  correctsPreviousAssumption,
  DEFAULT_QUESTION,
  parseQuestion,
  referencesSurroundingContext,
} from '../discord/parse-question.js';
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
  privilegedUserIds?: ReadonlySet<string> | undefined;
  evaluationStore?: EvaluationStore | undefined;
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

export function conversationMemoryKey(
  guildId: string | null,
  channelId: string,
): string {
  return `${guildId ?? '@me'}:${channelId}`;
}

function hasStandaloneEvidence(source: SourceContext): boolean {
  return (
    source.urls.length > 0 ||
    source.images.length > 0 ||
    source.attachments.length > 0 ||
    source.embeds.length > 0 ||
    Boolean(source.poll)
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

function pollMentionsBot(message: Message, botUserId: string): boolean {
  const question = message.poll?.question.text;
  return Boolean(question?.includes(`<@${botUserId}>`) || question?.includes(`<@!${botUserId}>`));
}

/** Records how the evidence source was chosen so evaluations can spot context drift. */
export type SourceSelection = 'reply' | 'memory' | 'direct' | 'ambient';

function buildResearchInput(
  question: string,
  source: SourceContext,
  resolvedTurns: readonly ResearchContextTurn[],
  memory: ThreadMemorySnapshot | null,
  message: Message,
  botUserId: string,
  privilegedUserIds?: ReadonlySet<string>,
  ambientSource = false,
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
      privilegedUser: privilegedUserIds?.has(message.author.id) ?? false,
      ...(ambientSource ? { ambientSource: true } : {}),
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

  if (
    !message.mentions.users.has(botUserId) &&
    botRoleIds.length === 0 &&
    !pollMentionsBot(message, botUserId)
  ) {
    return;
  }

  const isThread = message.channel.isThread();
  const memoryKey = conversationMemoryKey(message.guildId, message.channelId);
  const question = parseQuestion(message.content, botUserId, botRoleIds);
  const isCorrection = correctsPreviousAssumption(question);
  const existingMemory = isThread && !isCorrection
    ? dependencies.threadMemory.get(memoryKey)
    : null;
  const normalizedDirectSource = !message.reference?.messageId
    ? normalizeDiscordMessage(message)
    : null;
  // A deictic question ("ini beneran?") cannot stand alone, so it must not claim itself
  // as the source. Anything carrying its own evidence still does.
  const wantsSurroundingContext = !isCorrection && referencesSurroundingContext(question);
  const directSource =
    normalizedDirectSource &&
    (hasStandaloneEvidence(normalizedDirectSource) ||
      (!existingMemory && question !== DEFAULT_QUESTION && !wantsSurroundingContext))
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

  // A self-contained question is answered on its own terms. Recent channel chatter may
  // only become the source when the query is deictic or a bare mention, and never when
  // the user is correcting the bot, because that is when stale context misleads most.
  const allowAmbientSource = !directSource && wantsSurroundingContext;
  const resolved = await resolveDiscordContext(message, {
    botUserId,
    queryingUserId: message.author.id,
    allowAmbientSource,
  });

  if (message.reference?.messageId && !resolved?.source) {
    await replySafely(message, INACCESSIBLE_REFERENCE_RESPONSE, dependencies.logger);
    return;
  }

  // Corrections address the bot claim immediately above them. The oldest reply-chain
  // ancestor is useful for ordinary context, but using it here hides the claim being
  // challenged and can turn a verification request into an unrelated answer.
  const resolvedMessage = isCorrection
    ? (resolved?.replyTarget ?? resolved?.source)
    : resolved?.source;
  const resolvedSource = resolvedMessage ? normalizeDiscordMessage(resolvedMessage) : null;
  const memory =
    existingMemory &&
    (!resolvedSource || isStoredConversationSource(resolvedSource.messageId, existingMemory))
      ? existingMemory
      : null;
  const isReplySource = Boolean(message.reference?.messageId && resolvedSource);
  // A bare mention with no usable context still deserves an answer, so fall back to the
  // query message itself rather than refusing.
  const selfSource = normalizedDirectSource
    ? { ...normalizedDirectSource, text: question }
    : null;
  const source = memory?.source ?? resolvedSource ?? directSource ?? selfSource;
  const sourceSelection: SourceSelection | null = memory
    ? 'memory'
    : resolvedSource
      ? isReplySource
        ? 'reply'
        : 'ambient'
      : (directSource ?? selfSource)
        ? 'direct'
        : null;

  if (!source || !sourceSelection) {
    await replySafely(message, MISSING_REFERENCE_RESPONSE, dependencies.logger);
    return;
  }
  // A correction must not be answered against the context that produced the mistake.
  const contextTurns = isCorrection ? [] : (resolved?.turns ?? []);
  const input = buildResearchInput(
    question,
    source,
    contextTurns,
    memory,
    message,
    botUserId,
    dependencies.privilegedUserIds,
    sourceSelection === 'ambient',
  );

  const startedAt = performance.now();
  const diagnostics = {
    sourceSelection,
    ambientSourceUsed: sourceSelection === 'ambient',
    userCorrection: isCorrection,
    contextTurnCount: input.context?.length ?? 0,
    contractVersion: EVALUATION_CONTRACT_VERSION,
  } as const;

  try {
    const result = await withTyping(message, dependencies.logger, async () => {
      return research(dependencies.provider, input);
    });

    const assistantMessage = await replyWithLongMessage(message, result.content);
    if (isThread) {
      storeDeliveredInteraction(
        dependencies.threadMemory,
        memoryKey,
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
        ...diagnostics,
        ...(result.diagnostics ? { research: result.diagnostics } : {}),
      },
      'Research request completed',
    );
    await dependencies.evaluationStore?.recordConversation({
      input,
      response: result.content,
      model: dependencies.model,
      durationMs: Math.round(performance.now() - startedAt),
      status: 'completed',
      ...diagnostics,
      ...(result.diagnostics ? { research: result.diagnostics } : {}),
    });
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
        ...diagnostics,
      },
      'Research request failed',
    );
    await dependencies.evaluationStore?.recordConversation({
      input,
      model: dependencies.model,
      durationMs: Math.round(performance.now() - startedAt),
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      ...diagnostics,
    });
    await replySafely(message, RESEARCH_FAILURE_RESPONSE, dependencies.logger);
  }
}

export function registerMessageCreateHandler(dependencies: MessageCreateDependencies): void {
  dependencies.client.on(Events.MessageCreate, (message) => {
    void handleMessageCreate(message, dependencies);
  });
}
