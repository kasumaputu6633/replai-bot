import { describe, expect, it } from 'vitest';
import type { SourceContext } from '../context/types.js';
import { RESEARCH_SCOPE_REFUSAL } from '../security/guard.js';
import {
  appendTrustedSources,
  buildTrustedEvidenceCatalog,
  canonicalizeEvidenceUrl,
  ensureComparisonEvidenceCitations,
  hasComparisonEvidenceCoverage,
  MAX_EVIDENCE_ENTRIES,
  MAX_EVIDENCE_EXCERPT_LENGTH,
  MAX_EVIDENCE_TITLE_LENGTH,
  MAX_DISPLAYED_SOURCES,
} from './evidence.js';

const source: SourceContext = {
  messageId: 'source-1',
  text: 'A claim',
  urls: ['https://EXAMPLE.com/report?b=2&a=1#section', 'file:///private/report'],
  images: [],
  attachments: [],
  embeds: [],
};

describe('buildTrustedEvidenceCatalog', () => {
  it('canonicalizes HTTP URLs, excludes other protocols, deduplicates, and enriches entries', () => {
    const catalog = buildTrustedEvidenceCatalog({
      sources: [source],
      searchResults: [
        {
          title: 'Official report',
          url: 'https://example.com/report?a=1&b=2',
          snippet: 'Confirmed details.',
        },
      ],
    });

    expect(catalog).toEqual([
      {
        id: 1,
        kind: 'source',
        url: 'https://example.com/report?a=1&b=2',
        title: 'Official report',
        excerpt: 'Confirmed details.',
        targetIds: [1],
      },
    ]);
    expect(canonicalizeEvidenceUrl('javascript:alert(1)')).toBeUndefined();
  });

  it('caps entries and evidence field lengths', () => {
    const catalog = buildTrustedEvidenceCatalog({
      sources: [],
      searchResults: Array.from({ length: MAX_EVIDENCE_ENTRIES + 5 }, (_, index) => ({
        title: 't'.repeat(MAX_EVIDENCE_TITLE_LENGTH + 10),
        url: `https://example.com/${index}`,
        snippet: 's'.repeat(MAX_EVIDENCE_EXCERPT_LENGTH + 10),
      })),
    });

    expect(catalog).toHaveLength(MAX_EVIDENCE_ENTRIES);
    expect(catalog[0]?.title).toHaveLength(MAX_EVIDENCE_TITLE_LENGTH);
    expect(catalog[0]?.excerpt).toHaveLength(MAX_EVIDENCE_EXCERPT_LENGTH);
  });

  it('tracks target-specific search evidence and validates citation coverage', () => {
    const catalog = buildTrustedEvidenceCatalog({
      sources: [],
      targetedSearchResults: [
        {
          targetId: 1,
          result: { title: 'JCode docs', url: 'https://jcode.sh/docs', snippet: '' },
        },
        {
          targetId: 2,
          result: { title: 'OpenCode docs', url: 'https://opencode.ai/docs', snippet: '' },
        },
      ],
    });

    expect(catalog.map((entry) => entry.targetIds)).toEqual([[1], [2]]);
    expect(hasComparisonEvidenceCoverage('JCode [1], OpenCode [2].', catalog, 2)).toBe(true);
    expect(hasComparisonEvidenceCoverage('Only JCode [1].', catalog, 2)).toBe(false);

    const normalized = ensureComparisonEvidenceCitations(
      'Perbandingan:\n- JCode: terminal [1]\n- OpenCode: terminal lain',
      catalog,
      ['JCode', 'OpenCode'],
    );
    expect(normalized).toContain('- OpenCode: terminal lain [2]');
    expect(hasComparisonEvidenceCoverage(normalized, catalog, 2)).toBe(true);
  });
});

describe('appendTrustedSources', () => {
  const catalog = buildTrustedEvidenceCatalog({
    sources: [source],
    searchResults: [
      { title: 'Second source', url: 'https://other.example/article', snippet: 'Details' },
    ],
  });

  it('hides internal markers and appends only valid cited sources in catalog order', () => {
    const result = appendTrustedSources(
      'Claim from the second source [2]. Unsupported [99].\n\nSources:\n[99] https://evil.example',
      catalog,
    );

    expect(result).toContain('second source.');
    expect(result).not.toMatch(/\[\d+(?:,\s*\d+)*\]/u);
    expect(result).not.toContain('[99]');
    expect(result).not.toContain('evil.example');
    expect(result).toMatch(
      /\*\*Sources\*\*\n- \[Second source\]\(<https:\/\/other\.example\/article>\)$/u,
    );
    expect(result).not.toContain(catalog[0]?.url);
  });

  it('uses grouped and ranged citations internally without showing them to users', () => {
    const expandedCatalog = buildTrustedEvidenceCatalog({
      sources: [],
      searchResults: Array.from({ length: 6 }, (_, index) => ({
        title: `Source ${index + 1}`,
        url: `https://example.com/${index + 1}`,
        snippet: '',
      })),
    });

    const result = appendTrustedSources(
      'First claim [2, 3]. Second claim [3, 4-6]. Invalid [99].',
      expandedCatalog,
    );

    expect(result).toContain('First claim. Second claim. Invalid.');
    expect(result).not.toMatch(/\[\d+(?:,\s*\d+)*\]/u);
    expect(result).toContain('- [Source 2](<https://example.com/2>)');
    expect(result).toContain('- [Source 6](<https://example.com/6>)');
  });

  it('adds a small deterministic fallback list without inserting inline citations', () => {
    const result = appendTrustedSources('No inline claim citation was produced.', catalog);

    expect(result).toMatch(/^No inline claim citation was produced\.\n\n\*\*Sources\*\*/u);
    expect(result).not.toMatch(/produced\. \[\d+\]/u);
    expect(result).toContain('- [example.com](<https://example.com/report?a=1&b=2>)');
    expect(result).toContain('- [Second source](<https://other.example/article>)');
  });

  it('caps a citation-heavy source list while hiding its markers', () => {
    const largeCatalog = buildTrustedEvidenceCatalog({
      sources: [],
      searchResults: Array.from({ length: MAX_DISPLAYED_SOURCES + 4 }, (_, index) => ({
        title: `Source ${index + 1}`,
        url: `https://example.com/source-${index + 1}`,
        snippet: '',
      })),
    });
    const markers = largeCatalog.map((entry) => `[${entry.id}]`).join(' ');
    const result = appendTrustedSources(`Claim ${markers}`, largeCatalog);

    expect(result.match(/^- \[/gmu)).toHaveLength(MAX_DISPLAYED_SOURCES);
    expect(result).not.toMatch(/\[\d+(?:,\s*\d+)*\]/u);
    expect(result).not.toContain(`Source ${MAX_DISPLAYED_SOURCES + 1}`);
  });

  it('never appends sources to refusal responses', () => {
    expect(appendTrustedSources(RESEARCH_SCOPE_REFUSAL, catalog)).toBe(RESEARCH_SCOPE_REFUSAL);
    expect(appendTrustedSources("I can't help find that content.", catalog)).toBe(
      "I can't help find that content.",
    );
  });

  it('removes model-generated sources when casual output has no evidence catalog', () => {
    expect(
      appendTrustedSources(
        'Waduh, aku belum pegang bocoran dramanya.\n\nSources:\n- https://example.com/random',
        [],
      ),
    ).toBe('Waduh, aku belum pegang bocoran dramanya.');
  });
});
