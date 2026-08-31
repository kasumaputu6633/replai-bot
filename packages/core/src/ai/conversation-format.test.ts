import { describe, expect, it } from 'vitest';
import { compactConversationReply } from './conversation-format.js';

describe('compactConversationReply', () => {
  it('compacts unnecessary line breaks in short casual replies', () => {
    expect(
      compactConversationReply(
        'Ya lu sendiri lah anjir, nanya siapa yang paling mencurigakan.\n\nSok misterius amat.',
        'siapa yang paling mencurigakan?',
      ),
    ).toBe(
      'Ya lu sendiri lah anjir, nanya siapa yang paling mencurigakan. Sok misterius amat.',
    );
  });

  it('replaces em dashes in casual replies with chat-like punctuation', () => {
    expect(
      compactConversationReply(
        'Iya sih — idenya bagus, tapi eksekusinya masih berantakan.',
        'menurut lu gimana?',
      ),
    ).toBe('Iya sih, idenya bagus, tapi eksekusinya masih berantakan.');
  });

  it('normalizes AI-like Unicode punctuation even in long prose', () => {
    const content = `${'x'.repeat(610)} Ryan Gosling—misalnya jadi “what-if” saat T’Challa pergi…`;
    expect(compactConversationReply(content, 'menurut lu gimana?')).toBe(
      `${'x'.repeat(610)} Ryan Gosling, misalnya jadi "what-if" saat T'Challa pergi...`,
    );
  });

  it.each([
    ['buatkan puisi', 'Langit diam\nMalam pulang\n\nAku menunggu'],
    ['kasih contoh code', '```ts\nconst answer = 42;\n```'],
    ['buat list singkat', '- satu\n- dua\n- tiga'],
  ])('preserves format-sensitive output for %s', (request, content) => {
    expect(compactConversationReply(content, request)).toBe(content);
  });

  it('preserves em dashes when the requested format needs exact text', () => {
    const content = 'Langit — “diam”\nMalam pulang…';
    expect(compactConversationReply(content, 'buatkan puisi')).toBe(content);
  });

  it('keeps longer discussion paragraphs intact', () => {
    const paragraph = 'x'.repeat(350);
    const content = `${paragraph}\n\n${paragraph}`;
    expect(compactConversationReply(content, 'jelaskan secara mendalam')).toBe(content);
  });
});
