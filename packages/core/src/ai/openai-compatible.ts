import OpenAI from 'openai';
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { ResearchProviderError } from '../errors/index.js';
import { buildResearchPlan } from '../research/intent.js';
import {
  appendTrustedSources,
  buildTrustedEvidenceCatalog,
  ensureComparisonEvidenceCitations,
  hasComparisonEvidenceCoverage,
} from '../research/evidence.js';
import {
  ensureResearchModeStructure,
  hasComparisonTargetCoverage,
  hasRequiredModeStructure,
  researchTargetLabel,
} from '../research/mode.js';
import { researchInputSchema } from '../research/schemas.js';
import type {
  ResearchInput,
  ResearchParticipant,
  ResearchResult,
} from '../research/types.js';
import { guardResearchOutput, isResearchRefusal } from '../security/guard.js';
import type { ResearchProvider } from './provider.js';
import { compactConversationReply } from './conversation-format.js';
import {
  buildConversationPrompt,
  buildReplaiSystemPrompt,
  buildResearchPrompt,
  buildResponseRepairPrompt,
} from './prompts.js';
import type { OpenAICompatibleProviderConfig } from './types.js';
import {
  isAllowedWebFetchUrl,
  MAX_WEB_FETCH_URLS,
  NineRouterWebFetchClient,
} from './web-fetch.js';
import {
  buildWebSearchQuery,
  hasSearchableWebContext,
  NineRouterWebSearchClient,
} from './web-search.js';

const MAX_PARTICIPANT_AVATARS = 4;
const AVATAR_RELEVANT_REQUEST =
  /\b(?:avatar|pp|profile\s*(?:pic(?:ture)?|photo)|foto|photo|pic|gambar|muka|wajah|face|penampilan|appearance|outfit|roast|hujat|kritik|critique|rate|nilai|aura|vibe|kelihatan|ganteng|cantik)\b/iu;

function participantAvatarParts(input: ResearchInput): ChatCompletionContentPart[] {
  const candidates: ResearchParticipant[] = [...(input.metadata?.mentionedUsers ?? [])];
  if (AVATAR_RELEVANT_REQUEST.test(input.question)) {
    if (input.source.author) {
      candidates.push(input.source.author);
    }
    if (input.metadata?.userId && input.metadata.speakerName) {
      candidates.push({
        id: input.metadata.userId,
        name: input.metadata.speakerName,
        ...(input.metadata.speakerAvatarUrl
          ? { avatarUrl: input.metadata.speakerAvatarUrl }
          : {}),
      });
    }
    for (const turn of input.context ?? []) {
      if (turn.speakerId && turn.speakerName) {
        candidates.push({
          id: turn.speakerId,
          name: turn.speakerName,
          ...(turn.speakerAvatarUrl ? { avatarUrl: turn.speakerAvatarUrl } : {}),
        });
      }
    }
  }

  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const selected = candidates.filter((participant) => {
    if (
      !participant.avatarUrl ||
      seenIds.has(participant.id) ||
      seenUrls.has(participant.avatarUrl)
    ) {
      return false;
    }
    seenIds.add(participant.id);
    seenUrls.add(participant.avatarUrl);
    return true;
  }).slice(0, MAX_PARTICIPANT_AVATARS);

  return selected.flatMap<ChatCompletionContentPart>((participant) => [
    {
      type: 'text',
      text: `LABELED DISCORD AVATAR: ${participant.name} (user ID ${participant.id}). The next image is this participant's avatar. Comment only on visible details.`,
    },
    {
      type: 'image_url',
      image_url: { url: participant.avatarUrl!, detail: 'auto' },
    },
  ]);
}

export class OpenAICompatibleResearchProvider implements ResearchProvider {
  readonly #client: OpenAI;
  readonly #model: string;
  readonly #systemPrompt: string;
  readonly #temperature: number | undefined;
  readonly #webFetch: NineRouterWebFetchClient | undefined;
  readonly #webSearch: NineRouterWebSearchClient | undefined;

  public constructor(config: OpenAICompatibleProviderConfig) {
    this.#client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      // Some compatible gateways reject the SDK's default OpenAI user agent.
      defaultHeaders: { 'User-Agent': 'Replai/0.1.0' },
    });
    this.#model = config.model;
    this.#systemPrompt = buildReplaiSystemPrompt({
      model: config.publicModelName ?? config.model,
      ownerName: config.ownerName,
    });
    this.#temperature = config.temperature;
    this.#webFetch = config.webFetchModel && config.webApiKey && config.webBaseURL
      ? new NineRouterWebFetchClient({
          apiKey: config.webApiKey,
          baseURL: config.webBaseURL,
          model: config.webFetchModel,
        })
      : undefined;
    this.#webSearch = config.webSearchModel && config.webApiKey && config.webBaseURL
      ? new NineRouterWebSearchClient({
          apiKey: config.webApiKey,
          baseURL: config.webBaseURL,
          model: config.webSearchModel,
          maxResults: config.webSearchMaxResults ?? 5,
        })
      : undefined;
  }

  public async research(input: ResearchInput): Promise<ResearchResult> {
    const validatedInput = researchInputSchema.parse(input);

    try {
      const plan = buildResearchPlan(validatedInput);
      const mode = plan.mode;
      const isConversation = plan.interaction === 'conversation';
      const sources = [
        validatedInput.source,
        ...(validatedInput.comparisonSources ?? []),
      ];
      const comparisonTargetCount = mode === 'compare' ? sources.length : 0;
      const searchableInputs = sources.map((source) => ({ ...validatedInput, source }));
      const searchTasks = this.#webSearch
        ? searchableInputs
            .map((searchInput, index) => ({ searchInput, targetId: index + 1 }))
            .filter(({ searchInput }) => hasSearchableWebContext(searchInput))
            .map(({ searchInput, targetId }) => ({
              targetId,
              promise: this.#webSearch!.search(buildWebSearchQuery(searchInput)),
            }))
        : [];
      const fetchUrls = !plan.fetchSourceUrls
        ? []
        : [
            ...new Set(
              sources.flatMap((source) => source.urls).filter(isAllowedWebFetchUrl),
            ),
          ].slice(0, MAX_WEB_FETCH_URLS);
      const fetchTasks = this.#webFetch
        ? fetchUrls.map((url) => this.#webFetch!.fetch(url))
        : [];
      const [searchedContexts, fetchedPages] = await Promise.all([
        Promise.allSettled(searchTasks.map((task) => task.promise)),
        Promise.allSettled(fetchTasks),
      ]);
      const targetedWebSearchResults = searchedContexts.flatMap((result, index) =>
        result.status === 'fulfilled'
          ? result.value.map((searchResult) => ({
              targetId: searchTasks[index]!.targetId,
              result: searchResult,
            }))
          : [],
      );
      const webSearchResults = targetedWebSearchResults.map(({ result }) => result);
      const webFetchResults = fetchedPages.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      );
      const evidenceCatalog = buildTrustedEvidenceCatalog({
        sources: isConversation ? [] : sources,
        targetedSearchResults: targetedWebSearchResults,
        fetchedPages: webFetchResults,
      });
      const content: ChatCompletionContentPart[] = [
        {
          type: 'text',
          text: isConversation
            ? buildConversationPrompt(validatedInput)
            : buildResearchPrompt(
                validatedInput,
                webSearchResults,
                webFetchResults,
                evidenceCatalog,
              ),
        },
        ...validatedInput.source.images.map((image) => ({
          type: 'image_url' as const,
          image_url: { url: image.url, detail: 'auto' as const },
        })),
        ...participantAvatarParts(validatedInput),
      ];

      let previousDraft: string | undefined;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const attemptContent: ChatCompletionContentPart[] = previousDraft
          ? [
              ...content,
              {
                type: 'text',
                text: buildResponseRepairPrompt(
                  mode === 'verify' ? 'verify' : 'compare',
                  previousDraft,
                ),
              },
            ]
          : content;
        const completion = await this.#client.chat.completions.create({
          model: this.#model,
          ...(this.#temperature === undefined ? {} : { temperature: this.#temperature }),
          messages: [
            { role: 'system', content: this.#systemPrompt },
            // Only the active user's own turns and the bot's replies belong in the
            // transcript. Bystander messages travel inside the prompt payload as
            // labeled data so they cannot impersonate an instruction to the bot.
            ...(validatedInput.context ?? [])
              .filter(
                (turn) =>
                  turn.role === 'assistant' ||
                  !validatedInput.metadata?.userId ||
                  turn.speakerId === validatedInput.metadata.userId,
              )
              .map<ChatCompletionMessageParam>((turn) => ({
                role: turn.role,
                content:
                  turn.role === 'user' && turn.speakerName
                    ? `[${turn.speakerName}]: ${turn.content}`
                    : turn.content,
              })),
            { role: 'user', content: attemptContent },
          ],
        });
        const result = completion.choices[0]?.message.content?.trim();

        if (result) {
          const hasStructure = hasRequiredModeStructure(
            result,
            mode,
            comparisonTargetCount,
          );
          const coversTargets =
            mode !== 'compare' || hasComparisonTargetCoverage(result, sources);
          const coversTargetEvidence =
            mode !== 'compare' ||
            hasComparisonEvidenceCoverage(result, evidenceCatalog, comparisonTargetCount);
          if (attempt === 0 && (!hasStructure || !coversTargets || !coversTargetEvidence)) {
            previousDraft = result;
            continue;
          }

          const structured = ensureResearchModeStructure(
            result,
            mode,
            comparisonTargetCount,
          );
          const evidenced =
            mode === 'compare'
              ? ensureComparisonEvidenceCitations(
                  structured,
                  evidenceCatalog,
                  sources.map((source, index) => researchTargetLabel(source, index + 1)),
                )
              : structured;
          const guarded = guardResearchOutput(evidenced);
          const delivered = isConversation
            ? compactConversationReply(guarded, validatedInput.question)
            : guarded;
          return {
            content:
              guarded === evidenced && !isResearchRefusal(guarded)
                ? appendTrustedSources(delivered, isConversation ? [] : evidenceCatalog)
                : delivered,
            diagnostics: {
              interaction: plan.interaction,
              searchPerformed: searchTasks.length > 0,
              searchResultCount: webSearchResults.length,
              fetchedPageCount: webFetchResults.length,
              evidenceCount: evidenceCatalog.length,
              webSearchConfigured: this.#webSearch !== undefined,
            },
          };
        }
      }

      throw new ResearchProviderError('The AI provider returned an empty response.');
    } catch (error) {
      if (error instanceof ResearchProviderError) {
        throw error;
      }

      throw new ResearchProviderError('The AI provider request failed.', { cause: error });
    }
  }
}
