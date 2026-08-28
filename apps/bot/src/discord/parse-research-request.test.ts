import {
  MAX_RESEARCH_TURN_LENGTH,
  MAX_RESEARCH_TURNS,
  type SourceContext,
} from '@replai/core';
import { describe, expect, it } from 'vitest';
import {
  extractNamedComparisonSubjects,
  parseResearchRequest,
  type ResearchContextTurn,
} from './parse-research-request.js';

function source(urls: string[] = []): SourceContext {
  return {
    messageId: 'source',
    text: 'Original source',
    urls,
    images: [],
    attachments: [],
    embeds: [],
  };
}

function turn(
  messageId: string,
  role: ResearchContextTurn['role'],
  createdAt: number,
  text = messageId,
): ResearchContextTurn {
  return {
    messageId,
    authorId: `${role}-${messageId}`,
    authorName: role === 'assistant' ? 'Replai' : `Member ${messageId}`,
    role,
    text,
    createdAt: new Date(createdAt).toISOString(),
  };
}

describe('parseResearchRequest', () => {
  it('deduplicates before role conversion, removes the source, and keeps the newest bounded turns', () => {
    const turns = Array.from({ length: MAX_RESEARCH_TURNS + 2 }, (_, index) =>
      turn(`message-${index}`, 'participant', index),
    );
    turns.push(turn('message-9', 'assistant', 20, 'newest duplicate'));
    turns.push(turn('source', 'participant', 21, 'must not be duplicated'));

    const input = parseResearchRequest({
      question: 'Explain this',
      source: source(),
      contextTurns: turns,
    });

    expect(input.mode).toBe('answer');
    expect(input.context).toHaveLength(MAX_RESEARCH_TURNS);
    expect(input.context?.some((item) => item.content === 'must not be duplicated')).toBe(false);
    expect(input.context?.at(-1)).toEqual({
      role: 'assistant',
      content: 'newest duplicate',
      speakerId: 'assistant-message-9',
      speakerName: 'Replai',
    });
    expect(input).not.toHaveProperty('comparisonSources');
  });

  it('uses core inference for verification wording and bounds context content', () => {
    const input = parseResearchRequest({
      question: 'Apakah klaim ini benar?',
      source: source(),
      contextTurns: [turn('participant', 'participant', 1, 'x'.repeat(3_000))],
    });

    expect(input.mode).toBe('verify');
    expect(input.context).toEqual([
      {
        role: 'user',
        content: 'x'.repeat(MAX_RESEARCH_TURN_LENGTH),
        speakerId: 'participant-participant',
        speakerName: 'Member participant',
      },
    ]);
  });

  it.each([
    'menurutmu apakah dia sedang jatuh cinta gak dengan salah satu orang didiscord ini?',
    'ada mitos jika kamu panggil dia tiga kali, ia akan datang ke kamar kamu',
  ])('does not freeze casual banter into verification mode: %s', (question) => {
    expect(parseResearchRequest({ question, source: source() }).mode).toBe('answer');
  });

  it('creates explicit isolated targets for multiple source links only in compare mode', () => {
    const urls = ['https://one.example/', 'https://two.example/'];
    const input = parseResearchRequest({
      question: 'Bandingkan dua link ini',
      source: source(urls),
      contextTurns: [turn('other-message', 'user', 1, 'A separate claim')],
    });

    expect(input.mode).toBe('compare');
    expect(input.source.urls).toEqual([urls[0]]);
    expect(input.comparisonSources?.[0]).toEqual(
      expect.objectContaining({ messageId: 'source:url:1', text: urls[1], urls: [urls[1]] }),
    );
    expect(input.comparisonSources?.[1]).toMatchObject({
      messageId: 'other-message',
      text: 'A separate claim',
    });
  });

  it('extracts named competitors and researches each one as a separate target', () => {
    const question =
      'Pembanding ini dari agent lain apa? Pasti punya kelebihan dari semisal OpenCode, Kilo Code, dan lainnya?';

    expect(extractNamedComparisonSubjects(question)).toEqual(['OpenCode', 'Kilo Code']);

    const input = parseResearchRequest({
      question,
      source: source(['https://jcode.sh/']),
    });

    expect(input.mode).toBe('compare');
    expect(input.comparisonSources).toEqual([
      expect.objectContaining({ text: 'OpenCode', urls: [] }),
      expect.objectContaining({ text: 'Kilo Code', urls: [] }),
    ]);
  });

  it('does not create duplicate targets for equivalent URL variants', () => {
    const input = parseResearchRequest({
      question: 'Bandingkan dengan OpenCode',
      source: source(['https://jcode.sh', 'https://jcode.sh/']),
    });

    expect(input.source.urls).toHaveLength(1);
    expect(input.comparisonSources).toEqual([
      expect.objectContaining({ text: 'OpenCode', urls: [] }),
    ]);
  });
});
