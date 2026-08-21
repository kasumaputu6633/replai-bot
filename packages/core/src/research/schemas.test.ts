import { describe, expect, it } from 'vitest';
import {
  MAX_COMPARISON_SOURCES,
  MAX_RESEARCH_TURN_LENGTH,
  MAX_RESEARCH_TURNS,
} from '../context/limits.js';
import type { SourceContext } from '../context/types.js';
import { researchInputSchema } from './schemas.js';

function source(messageId: string): SourceContext {
  return {
    messageId,
    text: 'A claim',
    urls: [],
    images: [],
    attachments: [],
    embeds: [],
  };
}

describe('researchInputSchema', () => {
  it('keeps legacy callers valid and accepts bounded research fields', () => {
    expect(
      researchInputSchema.parse({ question: 'Explain this', source: source('primary') }),
    ).toEqual({ question: 'Explain this', source: source('primary') });

    expect(
      researchInputSchema.safeParse({
        question: 'Verify and compare',
        mode: 'verify',
        context: Array.from({ length: MAX_RESEARCH_TURNS }, (_, index) => ({
          role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
          content: 'x'.repeat(MAX_RESEARCH_TURN_LENGTH),
        })),
        source: source('primary'),
        comparisonSources: Array.from({ length: MAX_COMPARISON_SOURCES }, (_, index) =>
          source(`comparison-${index}`),
        ),
      }).success,
    ).toBe(true);
  });

  it('rejects invalid modes and over-limit context/comparison arrays', () => {
    const base = { question: 'Research this', source: source('primary') };

    expect(researchInputSchema.safeParse({ ...base, mode: 'browse' }).success).toBe(false);
    expect(
      researchInputSchema.safeParse({
        ...base,
        context: Array.from({ length: MAX_RESEARCH_TURNS + 1 }, () => ({
          role: 'user',
          content: 'turn',
        })),
      }).success,
    ).toBe(false);
    expect(
      researchInputSchema.safeParse({
        ...base,
        comparisonSources: Array.from({ length: MAX_COMPARISON_SOURCES + 1 }, (_, index) =>
          source(`comparison-${index}`),
        ),
      }).success,
    ).toBe(false);
  });
});
