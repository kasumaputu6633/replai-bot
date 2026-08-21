export { OpenAICompatibleResearchProvider } from './ai/openai-compatible.js';
export type { ResearchProvider } from './ai/provider.js';
export { REPLAI_SYSTEM_PROMPT, buildResearchPrompt } from './ai/prompts.js';
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
  MAX_RESEARCH_TURN_LENGTH,
  MAX_RESEARCH_TURNS,
  MAX_SOURCE_TEXT_LENGTH,
  MAX_URLS,
} from './context/limits.js';
export type {
  SourceAttachment,
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
  MAX_FALLBACK_SOURCES,
} from './research/evidence.js';
export type {
  EvidenceCatalogEntry,
  EvidenceKind,
  TargetedWebSearchResult,
  TrustedEvidenceInput,
} from './research/evidence.js';
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
  researchTurnSchema,
  sourceContextSchema,
} from './research/schemas.js';
export type {
  ResearchInput,
  ResearchMetadata,
  ResearchMode,
  ResearchResult,
  ResearchTurn,
} from './research/types.js';
export {
  assessResearchQuestion,
  guardResearchOutput,
  isResearchRefusal,
  RESEARCH_SCOPE_REFUSAL,
} from './security/guard.js';
export type { ResearchGuardDecision, ResearchGuardReason } from './security/guard.js';
