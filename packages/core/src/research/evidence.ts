import type { SourceContext } from '../context/types.js';
import { isResearchRefusal } from '../security/guard.js';
import type { WebFetchResult, WebSearchResult } from '../ai/types.js';

export const MAX_EVIDENCE_ENTRIES = 24;
export const MAX_EVIDENCE_URL_LENGTH = 2_048;
export const MAX_EVIDENCE_TITLE_LENGTH = 300;
export const MAX_EVIDENCE_EXCERPT_LENGTH = 1_500;
export const MAX_DISPLAYED_SOURCES = 8;

const CITATION_GROUP_PATTERN = /\[([\d\s,;–—-]+)\]/gu;

export type EvidenceKind = 'source' | 'search' | 'fetch';

export interface EvidenceCatalogEntry {
  id: number;
  kind: EvidenceKind;
  url: string;
  title: string;
  excerpt?: string | undefined;
  publishedAt?: string | undefined;
  targetIds?: number[] | undefined;
}

export interface TargetedWebSearchResult {
  targetId: number;
  result: WebSearchResult;
}

export interface TrustedEvidenceInput {
  sources: readonly SourceContext[];
  searchResults?: readonly WebSearchResult[] | undefined;
  targetedSearchResults?: readonly TargetedWebSearchResult[] | undefined;
  fetchedPages?: readonly WebFetchResult[] | undefined;
}

export function canonicalizeEvidenceUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password
    ) {
      return undefined;
    }

    url.hash = '';
    url.searchParams.sort();
    const canonical = url.href;
    return canonical.length <= MAX_EVIDENCE_URL_LENGTH ? canonical : undefined;
  } catch {
    return undefined;
  }
}

function bounded(value: string, maximum: number): string {
  return value.trim().slice(0, maximum);
}

export function buildTrustedEvidenceCatalog({
  sources,
  searchResults = [],
  targetedSearchResults = [],
  fetchedPages = [],
}: TrustedEvidenceInput): EvidenceCatalogEntry[] {
  const entries: EvidenceCatalogEntry[] = [];
  const byUrl = new Map<string, EvidenceCatalogEntry>();

  const add = (
    value: string,
    kind: EvidenceKind,
    title: string,
    excerpt?: string,
    publishedAt?: string,
    targetId?: number,
  ): void => {
    const url = canonicalizeEvidenceUrl(value);
    if (!url) {
      return;
    }

    const existing = byUrl.get(url);
    if (existing) {
      if (!existing.excerpt && excerpt?.trim()) {
        existing.excerpt = bounded(excerpt, MAX_EVIDENCE_EXCERPT_LENGTH);
      }
      if (existing.kind === 'source' && title.trim()) {
        existing.title = bounded(title, MAX_EVIDENCE_TITLE_LENGTH);
      }
      if (!existing.publishedAt && publishedAt?.trim()) {
        existing.publishedAt = bounded(publishedAt, 100);
      }
      if (targetId && !existing.targetIds?.includes(targetId)) {
        existing.targetIds = [...(existing.targetIds ?? []), targetId].sort(
          (left, right) => left - right,
        );
      }
      return;
    }

    if (entries.length >= MAX_EVIDENCE_ENTRIES) {
      return;
    }

    const entry: EvidenceCatalogEntry = {
      id: entries.length + 1,
      kind,
      url,
      title: bounded(title || new URL(url).hostname, MAX_EVIDENCE_TITLE_LENGTH),
      ...(excerpt?.trim()
        ? { excerpt: bounded(excerpt, MAX_EVIDENCE_EXCERPT_LENGTH) }
        : {}),
      ...(publishedAt?.trim() ? { publishedAt: bounded(publishedAt, 100) } : {}),
      ...(targetId ? { targetIds: [targetId] } : {}),
    };
    entries.push(entry);
    byUrl.set(url, entry);
  };

  for (const [sourceIndex, source] of sources.entries()) {
    const targetId = sourceIndex + 1;
    for (const url of source.urls) {
      add(url, 'source', 'Original source', undefined, undefined, targetId);
    }
    for (const embed of source.embeds) {
      if (embed.url) {
        add(
          embed.url,
          'source',
          embed.title ?? embed.provider ?? 'Original source',
          undefined,
          undefined,
          targetId,
        );
      }
    }
  }

  for (const result of searchResults) {
    add(result.url, 'search', result.title, result.snippet, result.publishedAt);
  }

  for (const { targetId, result } of targetedSearchResults) {
    add(
      result.url,
      'search',
      result.title,
      result.snippet,
      result.publishedAt,
      targetId,
    );
  }

  for (const page of fetchedPages) {
    add(page.url, 'fetch', page.title, page.content, page.publishedAt);
  }

  return entries;
}

function removeGeneratedSourcesSection(content: string): string {
  return content
    .replace(
      /(?:^|\n)(?:#{1,6}\s*)?(?:\*\*)?(?:Sources|Sumber)(?:\*\*)?\s*:?\s*\n[\s\S]*$/iu,
      '',
    )
    .trim();
}

function parseCitationIds(value: string): number[] {
  const ids: number[] = [];
  const tokenPattern = /(\d+)\s*[-–—]\s*(\d+)|(\d+)/gu;

  for (const match of value.matchAll(tokenPattern)) {
    const single = match[3];
    if (single) {
      ids.push(Number(single));
      continue;
    }

    const start = Number(match[1]);
    const end = Number(match[2]);
    if (start > end || end - start >= MAX_EVIDENCE_ENTRIES) {
      continue;
    }
    for (let id = start; id <= end; id += 1) {
      ids.push(id);
    }
  }

  return [...new Set(ids)];
}

function sourceLabel(entry: EvidenceCatalogEntry): string {
  const hostname = new URL(entry.url).hostname.replace(/^www\./u, '');
  const title = /^original source$/iu.test(entry.title.trim()) ? hostname : entry.title;
  const compact = title.replace(/\s+/gu, ' ').trim().slice(0, 100) || hostname;
  return compact.replace(/[\\[\]*_~`]/gu, '\\$&');
}

export function hasComparisonEvidenceCoverage(
  content: string,
  catalog: readonly EvidenceCatalogEntry[],
  targetCount: number,
): boolean {
  const citedIds = new Set<number>();
  for (const match of content.matchAll(CITATION_GROUP_PATTERN)) {
    for (const id of parseCitationIds(match[1] ?? '')) {
      citedIds.add(id);
    }
  }

  return Array.from({ length: targetCount }, (_, index) => index + 1).every((targetId) => {
    const targetEvidence = catalog.filter((entry) => entry.targetIds?.includes(targetId));
    return (
      targetEvidence.length === 0 || targetEvidence.some((entry) => citedIds.has(entry.id))
    );
  });
}

export function ensureComparisonEvidenceCitations(
  content: string,
  catalog: readonly EvidenceCatalogEntry[],
  targetLabels: readonly string[],
): string {
  const citedIds = new Set<number>();
  for (const match of content.matchAll(CITATION_GROUP_PATTERN)) {
    for (const id of parseCitationIds(match[1] ?? '')) {
      citedIds.add(id);
    }
  }

  const lines = content.split('\n');
  for (const [index, label] of targetLabels.entries()) {
    const targetId = index + 1;
    const targetEvidence = catalog.filter((entry) => entry.targetIds?.includes(targetId));
    if (
      targetEvidence.length === 0 ||
      targetEvidence.some((entry) => citedIds.has(entry.id))
    ) {
      continue;
    }

    const lineIndex = lines.findIndex((line) =>
      line.toLocaleLowerCase('en-US').includes(label.toLocaleLowerCase('en-US')),
    );
    const evidence = targetEvidence[0];
    if (lineIndex >= 0 && evidence) {
      lines[lineIndex] = `${lines[lineIndex]!.trimEnd()} [${evidence.id}]`;
      citedIds.add(evidence.id);
    }
  }

  return lines.join('\n');
}

export function appendTrustedSources(
  content: string,
  catalog: readonly EvidenceCatalogEntry[],
): string {
  if (isResearchRefusal(content)) {
    return content.trim();
  }

  const trustedIds = new Set(catalog.map((entry) => entry.id));
  const citedIds = new Set<number>();
  const withoutGeneratedSources = removeGeneratedSourcesSection(content).replace(
    /^\s*(?:-{3,}|_{3,}|\*{3,})\s*$/gmu,
    '',
  );

  for (const match of withoutGeneratedSources.matchAll(CITATION_GROUP_PATTERN)) {
    for (const id of parseCitationIds(match[1] ?? '')) {
      if (trustedIds.has(id)) {
        citedIds.add(id);
      }
    }
  }

  let selected: EvidenceCatalogEntry[];
  if (citedIds.size === 0) {
    selected = [];
  } else {
    const citedEntries = catalog.filter((entry) => citedIds.has(entry.id));
    const selectedIds = new Set<number>();
    const targetIds = new Set(citedEntries.flatMap((entry) => entry.targetIds ?? []));
    for (const targetId of [...targetIds].sort((left, right) => left - right)) {
      const targetEntry = citedEntries.find((entry) => entry.targetIds?.includes(targetId));
      if (targetEntry) {
        selectedIds.add(targetEntry.id);
      }
    }
    for (const entry of citedEntries) {
      if (selectedIds.size >= MAX_DISPLAYED_SOURCES) {
        break;
      }
      selectedIds.add(entry.id);
    }
    selected = catalog.filter((entry) => selectedIds.has(entry.id));
  }

  const sanitized = withoutGeneratedSources
    .replace(CITATION_GROUP_PATTERN, '')
    .replace(/[ \t]+([,.;:!?])/gu, '$1')
    .trim();

  if (selected.length === 0) {
    return sanitized;
  }

  const sources = selected
    .map((entry) => `- [${sourceLabel(entry)}](<${entry.url}>)`)
    .join('\n');
  return `${sanitized}\n\n**Sources**\n${sources}`.trim();
}
