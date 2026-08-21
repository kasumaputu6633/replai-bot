import OpenAI from 'openai';
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions';
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
import type { ResearchInput, ResearchResult } from '../research/types.js';
import { guardResearchOutput, isResearchRefusal } from '../security/guard.js';
import type { ResearchProvider } from './provider.js';
import {
  buildCasualPrompt,
  buildResearchPrompt,
  buildResponseRepairPrompt,
  REPLAI_SYSTEM_PROMPT,
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

export class OpenAICompatibleResearchProvider implements ResearchProvider {
  readonly #client: OpenAI;
  readonly #model: string;
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
    this.#webFetch = config.webFetchModel
      ? new NineRouterWebFetchClient({
          apiKey: config.apiKey,
          baseURL: config.baseURL,
          model: config.webFetchModel,
        })
      : undefined;
    this.#webSearch = config.webSearchModel
      ? new NineRouterWebSearchClient({
          apiKey: config.apiKey,
          baseURL: config.baseURL,
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
      const isCasualConversation = plan.interaction === 'casual';
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
        sources: isCasualConversation ? [] : sources,
        targetedSearchResults: targetedWebSearchResults,
        fetchedPages: webFetchResults,
      });
      const content: ChatCompletionContentPart[] = [
        {
          type: 'text',
          text: isCasualConversation
            ? buildCasualPrompt(validatedInput)
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
          messages: [
            { role: 'system', content: REPLAI_SYSTEM_PROMPT },
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
          return {
            content:
              guarded === evidenced && !isResearchRefusal(guarded)
                ? appendTrustedSources(guarded, isCasualConversation ? [] : evidenceCatalog)
                : guarded,
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
