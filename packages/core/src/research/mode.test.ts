import { describe, expect, it } from 'vitest';
import type { ResearchInput } from './types.js';
import {
  ensureResearchModeStructure,
  hasComparisonTargetCoverage,
  hasRequiredModeStructure,
  researchTargetLabel,
  resolveResearchMode,
} from './mode.js';

function input(question: string): ResearchInput {
  return {
    question,
    source: {
      messageId: 'source-1',
      text: 'A claim',
      urls: [],
      images: [],
      attachments: [],
      embeds: [],
    },
  };
}

describe('research modes', () => {
  it('uses an explicit mode and otherwise infers verification/comparison', () => {
    expect(resolveResearchMode({ ...input('Is this true?'), mode: 'answer' })).toBe('answer');
    expect(resolveResearchMode(input('Is this true?'))).toBe('verify');
    expect(resolveResearchMode(input('Bandingkan dua klaim ini'))).toBe('compare');
    expect(resolveResearchMode(input('Apa pembanding dan kompetitor produk ini?'))).toBe('compare');
    expect(resolveResearchMode(input('Explain this'))).toBe('answer');
  });

  it('requires and safely supplies explicit verification sections', () => {
    const content = ensureResearchModeStructure('The claim lacks support [1].', 'verify');

    expect(hasRequiredModeStructure(content, 'verify')).toBe(true);
    expect(content).toContain('Verdict:');
    expect(content).toContain('Tidak cukup bukti');
    expect(content).toContain('Evidence:');
    expect(content).toContain('Confidence:');
    expect(content).toContain('Rendah');
    expect(content).toContain('Limitations:');
  });

  it('keeps comparison prose natural without requiring report headings', () => {
    const draft =
      'JCode unggul untuk terminal ringan, sedangkan Kilo Code lebih cocok untuk workflow terintegrasi.';
    const content = ensureResearchModeStructure(draft, 'compare', 2);

    expect(content).toBe(draft);
    expect(hasRequiredModeStructure(content, 'compare', 2)).toBe(true);
  });

  it('labels comparison targets and requires every named target in the answer', () => {
    const primary = {
      ...input('Compare these').source,
      text: null,
      urls: ['https://jcode.sh/'],
    };
    const competitor = { ...input('Compare these').source, text: 'Kilo Code' };

    expect(researchTargetLabel(primary, 1)).toBe('jcode.sh');
    expect(researchTargetLabel(competitor, 2)).toBe('Kilo Code');
    expect(hasComparisonTargetCoverage('jcode.sh compared with Kilo Code.', [primary, competitor]))
      .toBe(true);
    expect(hasComparisonTargetCoverage('Only jcode.sh is described.', [primary, competitor])).toBe(
      false,
    );
  });
});
