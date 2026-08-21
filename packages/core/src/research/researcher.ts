import type { ResearchProvider } from '../ai/provider.js';
import { assessResearchQuestion, RESEARCH_SCOPE_REFUSAL } from '../security/guard.js';
import { researchInputSchema } from './schemas.js';
import type { ResearchInput, ResearchResult } from './types.js';

export async function research(
  provider: ResearchProvider,
  input: ResearchInput,
): Promise<ResearchResult> {
  const validatedInput = researchInputSchema.parse(input);
  const guardDecision = assessResearchQuestion(validatedInput.question);

  if (!guardDecision.allowed) {
    return { content: RESEARCH_SCOPE_REFUSAL };
  }

  return provider.research(validatedInput);
}
