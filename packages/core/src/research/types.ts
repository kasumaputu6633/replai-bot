import type { SourceContext } from '../context/types.js';

export type ResearchMode = 'answer' | 'verify' | 'compare';

export interface ResearchTurn {
  role: 'user' | 'assistant';
  content: string;
  speakerId?: string | undefined;
  speakerName?: string | undefined;
  speakerAvatarUrl?: string | undefined;
}

export interface ResearchParticipant {
  id: string;
  name: string;
  avatarUrl?: string | undefined;
}

export interface ResearchMetadata {
  guildId?: string | undefined;
  channelId?: string | undefined;
  sourceMessageId?: string | undefined;
  queryMessageId?: string | undefined;
  userId?: string | undefined;
  speakerName?: string | undefined;
  speakerAvatarUrl?: string | undefined;
  mentionedUsers?: ResearchParticipant[] | undefined;
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
