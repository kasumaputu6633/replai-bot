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
  privilegedUser?: boolean | undefined;
  /**
   * True when the source is unrelated channel chatter rather than a reply target.
   *
   * Ambient text must not be treated as the subject of the question, so it is kept
   * out of search queries.
   */
  ambientSource?: boolean | undefined;
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
  /**
   * Reports whether the answer was actually grounded in retrieved evidence.
   *
   * A confident answer with `searchPerformed: false` and no evidence is the shape of
   * an unverified claim, so recording this makes that failure measurable.
   */
  diagnostics?:
    | {
        interaction: 'conversation' | 'research';
        searchPerformed: boolean;
        searchResultCount: number;
        fetchedPageCount: number;
        evidenceCount: number;
        webSearchConfigured: boolean;
      }
    | undefined;
}
