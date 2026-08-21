import type { SourceContext } from '../context/types.js';

export type ResearchMode = 'answer' | 'verify' | 'compare';

export interface ResearchTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ResearchMetadata {
  guildId?: string | undefined;
  channelId?: string | undefined;
  sourceMessageId?: string | undefined;
  queryMessageId?: string | undefined;
  userId?: string | undefined;
}

export interface ResearchInput {
  question: string;
  source: SourceContext;
  mode?: ResearchMode | undefined;
  context?: ResearchTurn[] | undefined;
  comparisonSources?: SourceContext[] | undefined;
  metadata?: ResearchMetadata | undefined;
}

export interface ResearchResult {
  content: string;
}
