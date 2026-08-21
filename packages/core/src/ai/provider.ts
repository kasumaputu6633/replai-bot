import type { ResearchInput, ResearchResult } from '../research/types.js';

export interface ResearchProvider {
  research(input: ResearchInput): Promise<ResearchResult>;
}
