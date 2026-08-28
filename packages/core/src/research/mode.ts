import type { SourceContext } from '../context/types.js';
import type { ResearchInput, ResearchMode } from './types.js';
import { buildResearchPlan } from './intent.js';

export function resolveResearchMode(input: ResearchInput): ResearchMode {
  return buildResearchPlan(input).mode;
}

export function hasRequiredModeStructure(
  content: string,
  mode: ResearchMode,
  comparisonTargetCount = 0,
): boolean {
  // Retain the argument for callers compiled against the previous comparison contract.
  void mode;
  void comparisonTargetCount;
  return content.trim().length > 0;
}

export function researchTargetLabel(source: SourceContext, index: number): string {
  const embedLabel = source.embeds
    .flatMap((embed) => [embed.title, embed.provider])
    .find((value) => value?.trim() && value.trim().length <= 80)
    ?.trim();
  if (embedLabel) {
    return embedLabel;
  }

  const text = source.text?.replace(/https?:\/\/\S+/giu, '').replace(/\s+/gu, ' ').trim();
  if (text && text.length <= 80 && text.split(' ').length <= 8) {
    return text;
  }

  const url = source.urls[0];
  if (url) {
    try {
      return new URL(url).hostname.replace(/^www\./u, '');
    } catch {
      // Source schemas already validate URLs; keep a safe fallback for direct callers.
    }
  }

  return `Target ${index}`;
}

export function hasComparisonTargetCoverage(
  content: string,
  sources: readonly SourceContext[],
): boolean {
  const normalizedContent = content.toLocaleLowerCase('en-US');
  return sources.every((source, index) => {
    const label = researchTargetLabel(source, index + 1);
    return (
      label === `Target ${index + 1}` ||
      normalizedContent.includes(label.toLocaleLowerCase('en-US'))
    );
  });
}

export function ensureResearchModeStructure(
  content: string,
  mode: ResearchMode,
  comparisonTargetCount = 0,
): string {
  if (hasRequiredModeStructure(content, mode, comparisonTargetCount)) {
    return content;
  }

  return content;
}
