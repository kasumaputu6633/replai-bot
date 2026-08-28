export { OpenAICompatibleResearchProvider } from './ai/openai-compatible.js';
export { compactConversationReply } from './ai/conversation-format.js';
export type { ResearchProvider } from './ai/provider.js';
export {
  buildConversationPrompt,
  buildReplaiSystemPrompt,
  buildResearchPrompt,
  REPLAI_SYSTEM_PROMPT,
} from './ai/prompts.js';
export type {
  OpenAICompatibleProviderConfig,
  WebFetchResult,
  WebSearchResult,
} from './ai/types.js';
export { isImageAttachment, isSupportedImage } from './context/images.js';
export {
  MAX_ATTACHMENTS,
  MAX_COMPARISON_SOURCES,
  MAX_EMBEDS,
  MAX_IMAGES,
  MAX_RESEARCH_PARTICIPANTS,
  MAX_RESEARCH_TURN_LENGTH,
  MAX_RESEARCH_TURNS,
  MAX_SOURCE_TEXT_LENGTH,
  MAX_URLS,
} from './context/limits.js';
export type {
  SourceAttachment,
  SourceAuthor,
  SourceContext,
  SourceEmbed,
  SourceImage,
} from './context/types.js';
export { extractHttpUrls } from './context/urls.js';
export { ResearchProviderError } from './errors/index.js';
export { research } from './research/researcher.js';
export {
  appendTrustedSources,
  buildTrustedEvidenceCatalog,
  canonicalizeEvidenceUrl,
  ensureComparisonEvidenceCitations,
  hasComparisonEvidenceCoverage,
  MAX_DISPLAYED_SOURCES,
  MAX_EVIDENCE_ENTRIES,
  MAX_EVIDENCE_EXCERPT_LENGTH,
  MAX_EVIDENCE_TITLE_LENGTH,
  MAX_EVIDENCE_URL_LENGTH,
} from './research/evidence.js';
export type {
  EvidenceCatalogEntry,
  EvidenceKind,
  TargetedWebSearchResult,
  TrustedEvidenceInput,
} from './research/evidence.js';
export {
  buildResearchPlan,
  type ResearchInteraction,
  type ResearchPlan,
  type ResearchSearchStrategy,
} from './research/intent.js';
export {
  ensureResearchModeStructure,
  hasComparisonTargetCoverage,
  hasRequiredModeStructure,
  researchTargetLabel,
  resolveResearchMode,
} from './research/mode.js';
export {
  researchInputSchema,
  researchModeSchema,
  researchParticipantSchema,
  researchTurnSchema,
  sourceAuthorSchema,
  sourceContextSchema,
} from './research/schemas.js';
export type {
  ResearchInput,
  ResearchMetadata,
  ResearchMode,
  ResearchParticipant,
  ResearchResult,
  ResearchTurn,
} from './research/types.js';
export {
  assessResearchQuestion,
  buildResearchGuardRefusal,
  guardResearchOutput,
  isResearchRefusal,
  RESEARCH_SCOPE_REFUSAL,
} from './security/guard.js';
export type { ResearchGuardDecision, ResearchGuardReason } from './security/guard.js';
