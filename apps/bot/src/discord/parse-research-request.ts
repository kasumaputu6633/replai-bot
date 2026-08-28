import {
  canonicalizeEvidenceUrl,
  extractHttpUrls,
  MAX_COMPARISON_SOURCES,
  MAX_RESEARCH_TURN_LENGTH,
  MAX_RESEARCH_TURNS,
  MAX_URLS,
  resolveResearchMode,
  type ResearchInput,
  type SourceContext,
} from '@replai/core';

export interface ResearchContextTurn {
  messageId: string;
  authorId?: string | undefined;
  authorName?: string | undefined;
  authorAvatarUrl?: string | undefined;
  role: 'user' | 'assistant' | 'participant';
  text: string;
  createdAt: string;
}

export interface ParseResearchRequestOptions {
  question: string;
  source: SourceContext;
  contextTurns?: readonly ResearchContextTurn[];
}

export const MAX_NAMED_COMPARISON_SUBJECTS = 3;

const COMPARISON_SUBJECTS =
  /(?:\b(?:bandingkan|dibanding(?:kan)?|versus|vs\.?)\b(?:\s+dengan)?|\bcompar(?:e|ed)\s+(?:with|to)\b|\b(?:semisal|misalnya|contohnya|seperti|such as|for example)\b)\s+([^?!.]+)/iu;
const GENERIC_COMPARISON_SUBJECT =
  /^(?:apa|what|ini|keduanya|lainnya|yang lain(?:nya)?|others?|the others?|alternatif(?: lain)?|kompetitor(?: lain)?|saingan(?: lain)?|(?:dua|kedua)\s+(?:link|sumber|produk|klaim)(?:\s+ini)?|(?:coding\s+)?agents?\s+(?:lain|lainnya)|other\s+(?:coding\s+)?agents?)$/iu;

export function extractNamedComparisonSubjects(question: string): string[] {
  const captured = COMPARISON_SUBJECTS.exec(question)?.[1];
  if (!captured) {
    return [];
  }

  const subjects: string[] = [];
  const seen = new Set<string>();
  for (const candidate of captured.split(/\s*(?:,|;|\b(?:dan|and|atau|or)\b)\s*/iu)) {
    const subject = candidate
      .replace(/^[\s:–—-]+|[\s:–—-]+$/gu, '')
      .replace(/\s+/gu, ' ')
      .trim()
      .slice(0, 80);
    const normalized = subject.toLocaleLowerCase('en-US');
    if (
      !subject ||
      GENERIC_COMPARISON_SUBJECT.test(subject) ||
      /^https?:\/\//iu.test(subject) ||
      seen.has(normalized)
    ) {
      continue;
    }

    seen.add(normalized);
    subjects.push(subject);
    if (subjects.length === MAX_NAMED_COMPARISON_SUBJECTS) {
      break;
    }
  }

  return subjects;
}

function boundedContextTurns(
  turns: readonly ResearchContextTurn[],
  sourceMessageId: string,
): ResearchContextTurn[] {
  const byMessageId = new Map<string, ResearchContextTurn>();
  for (const turn of turns) {
    if (turn.messageId !== sourceMessageId && turn.text.trim()) {
      byMessageId.set(turn.messageId, turn);
    }
  }

  return [...byMessageId.values()]
    .sort((left, right) => {
      const timestampDifference = left.createdAt.localeCompare(right.createdAt);
      return timestampDifference !== 0
        ? timestampDifference
        : left.messageId.localeCompare(right.messageId);
    })
    .slice(-MAX_RESEARCH_TURNS);
}

function contextSource(turn: ResearchContextTurn): SourceContext {
  const text = turn.text.trim().slice(0, MAX_RESEARCH_TURN_LENGTH);
  return {
    messageId: turn.messageId,
    text,
    urls: extractHttpUrls(text).slice(0, MAX_URLS),
    images: [],
    attachments: [],
    embeds: [],
  };
}

function uniqueComparisonUrls(urls: readonly string[]): string[] {
  const unique = new Map<string, string>();
  for (const url of urls) {
    unique.set(canonicalizeEvidenceUrl(url) ?? url, url);
  }
  return [...unique.values()];
}

function buildComparisonTargets(
  source: SourceContext,
  turns: readonly ResearchContextTurn[],
  namedSubjects: readonly string[],
): { source: SourceContext; comparisonSources: SourceContext[] } {
  let primarySource = source;
  const comparisonSources: SourceContext[] = [];
  const sourceUrls = uniqueComparisonUrls(source.urls);
  if (sourceUrls.length !== source.urls.length) {
    primarySource = { ...source, urls: sourceUrls };
  }

  if (sourceUrls.length > 1) {
    primarySource = { ...source, urls: [sourceUrls[0]!] };
    for (const [index, url] of sourceUrls.slice(1).entries()) {
      comparisonSources.push({
        messageId: `${source.messageId}:url:${index + 1}`,
        text: url,
        urls: [url],
        images: [],
        attachments: [],
        embeds: [],
      });
      if (comparisonSources.length === MAX_COMPARISON_SOURCES) {
        return { source: primarySource, comparisonSources };
      }
    }
  }

  for (const [index, subject] of namedSubjects.entries()) {
    comparisonSources.push({
      messageId: `${source.messageId}:subject:${index + 1}`,
      text: subject,
      urls: [],
      images: [],
      attachments: [],
      embeds: [],
    });
    if (comparisonSources.length === MAX_COMPARISON_SOURCES) {
      return { source: primarySource, comparisonSources };
    }
  }

  for (const turn of turns.slice().reverse()) {
    comparisonSources.push(contextSource(turn));
    if (comparisonSources.length === MAX_COMPARISON_SOURCES) {
      break;
    }
  }

  return { source: primarySource, comparisonSources };
}

export function parseResearchRequest(options: ParseResearchRequestOptions): ResearchInput {
  const turns = boundedContextTurns(
    options.contextTurns ?? [],
    options.source.messageId,
  );
  const context = turns.map((turn) => ({
    role: turn.role === 'assistant' ? ('assistant' as const) : ('user' as const),
    content: turn.text.trim().slice(0, MAX_RESEARCH_TURN_LENGTH),
    ...(turn.authorId ? { speakerId: turn.authorId } : {}),
    ...(turn.authorName ? { speakerName: turn.authorName } : {}),
    ...(turn.authorAvatarUrl ? { speakerAvatarUrl: turn.authorAvatarUrl } : {}),
  }));
  const input: ResearchInput = {
    question: options.question,
    source: options.source,
    ...(context.length > 0 ? { context } : {}),
  };
  const mode = resolveResearchMode(input);

  if (mode !== 'compare') {
    return { ...input, mode };
  }

  const targets = buildComparisonTargets(
    options.source,
    turns,
    extractNamedComparisonSubjects(options.question),
  );
  return {
    ...input,
    source: targets.source,
    mode,
    ...(targets.comparisonSources.length > 0
      ? { comparisonSources: targets.comparisonSources }
      : {}),
  };
}
