import { describe, expect, it } from 'vitest';
import type { ResearchInput } from './types.js';
import { buildResearchPlan } from './intent.js';

function input(question: string, options: { image?: boolean; url?: string } = {}): ResearchInput {
  return {
    question,
    source: {
      messageId: 'source',
      text: question,
      urls: options.url ? [options.url] : [],
      images: options.image ? [{ url: 'https://cdn.discordapp.com/image.png' }] : [],
      attachments: [],
      embeds: [],
    },
  };
}

describe('buildResearchPlan', () => {
  it.each([
    ['kelihatan banget blm mandi nya kan', { image: true }],
    ['menurutmu apakah dia sedang jatuh cinta gak dengan salah satu orang didiscord ini?', {}],
    ['ada mitos jika kamu panggil dia tiga kali, ia akan datang ke kamar kamu', {}],
    ['coba sindir dikit politik hari ini wkwk', {}],
    ['sarkasin dikit kelakuan dia bro', {}],
  ])('keeps screenshot-derived banter and jokes source-free: %s', (question, options) => {
    expect(buildResearchPlan(input(question, options))).toEqual({
      mode: 'answer',
      interaction: 'casual',
      search: 'none',
      fetchSourceUrls: false,
    });
  });

  it.each([
    ['Apakah klaim ini benar?', 'verify'],
    ['Cek fakta berita ini', 'verify'],
    ['Bandingkan JCode dengan OpenCode', 'compare'],
  ])('preserves real research intent: %s', (question, mode) => {
    const plan = buildResearchPlan(input(question));
    expect(plan.mode).toBe(mode);
    expect(plan.interaction).toBe('research');
    expect(plan.search).not.toBe('none');
  });

  it('researches current data and URLs but not ordinary unmatched text', () => {
    expect(buildResearchPlan(input('besok Denpasar Barat cerah nggak?')).search).toBe('single');
    expect(buildResearchPlan(input('apa isi halaman ini?', { url: 'https://example.com' }))).toMatchObject({
      search: 'single',
      fetchSourceUrls: true,
    });
    expect(buildResearchPlan(input('jelaskan pendapat ini')).search).toBe('none');
  });
});
