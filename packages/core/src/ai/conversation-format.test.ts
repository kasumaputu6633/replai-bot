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

  it.each([
    ['buatkan puisi', 'Langit diam\nMalam pulang\n\nAku menunggu'],
    ['kasih contoh code', '```ts\nconst answer = 42;\n```'],
    ['buat list singkat', '- satu\n- dua\n- tiga'],
  ])('preserves format-sensitive output for %s', (request, content) => {
    expect(compactConversationReply(content, request)).toBe(content);
  });

  it('keeps longer discussion paragraphs intact', () => {
    const paragraph = 'x'.repeat(350);
    const content = `${paragraph}\n\n${paragraph}`;
    expect(compactConversationReply(content, 'jelaskan secara mendalam')).toBe(content);
  });
});
