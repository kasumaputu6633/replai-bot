import type { SourceContext } from '../context/types.js';
import type { ResearchInput, ResearchMode } from './types.js';

const VERIFICATION_QUESTION =
  /(?:\bis (?:this|that) true\b|\b(?:verify|verification|fact[ -]?check|true or false)\b|\b(?:cek fakta|verifikasi|benar|salah|hoaks?|valid|akurat|bukti)\b)/iu;
const COMPARISON_QUESTION =
  /\b(?:compare|comparison|competitors?|alternatives?|versus|vs\.?|bandingkan|perbandingan|pembanding|dibanding(?:kan)?|kompetitor|saingan|alternatif|persamaan|perbedaan)\b/iu;

export function resolveResearchMode(input: ResearchInput): ResearchMode {
  if (input.mode) {
    return input.mode;
  }

  if ((input.comparisonSources?.length ?? 0) > 0 || COMPARISON_QUESTION.test(input.question)) {
    return 'compare';
  }

  return VERIFICATION_QUESTION.test(input.question) ? 'verify' : 'answer';
}

export function hasRequiredModeStructure(
  content: string,
  mode: ResearchMode,
  comparisonTargetCount = 0,
): boolean {
  // Retain the argument for callers compiled against the previous comparison contract.
  void comparisonTargetCount;
  if (mode === 'answer' || mode === 'compare') {
    return true;
  }

  const requiredHeadingGroups = [['Verdict'], ['Evidence'], ['Confidence'], ['Limitations']];

  return requiredHeadingGroups.every((headings) =>
    headings.some((heading) =>
      new RegExp(
        `^(?:#{1,6}\\s*)?(?:\\*\\*)?${heading}(?::(?:\\*\\*)?|(?:\\*\\*)?:)\\s*`,
        'imu',
      ).test(content),
    ),
  );
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

  if (mode === 'verify') {
    return `Verdict: Tidak cukup bukti.\n\nEvidence: ${content}\n\nConfidence: Rendah.\n\nLimitations: Respons penyedia tidak menghasilkan struktur verifikasi yang lengkap, jadi kesimpulan tegas tidak dapat diberikan.`;
  }

  return content;
}
