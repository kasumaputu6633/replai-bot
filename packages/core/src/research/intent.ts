import type { ResearchInput, ResearchMode } from './types.js';

export type ResearchInteraction = 'casual' | 'research';
export type ResearchSearchStrategy = 'none' | 'single' | 'per-target';

export interface ResearchPlan {
  mode: ResearchMode;
  interaction: ResearchInteraction;
  search: ResearchSearchStrategy;
  fetchSourceUrls: boolean;
}

const COMPARISON_QUESTION =
  /\b(?:compare|comparison|competitors?|alternatives?|versus|vs\.?|bandingkan|perbandingan|pembanding|dibanding(?:kan)?|kompetitor|saingan|alternatif|persamaan|perbedaan)\b/iu;
const VERIFICATION_QUESTION =
  /(?:\bis (?:this|that) true\b|\b(?:verify|verification|fact[ -]?check|true or false|cek fakta|verifikasi|hoaks?)\b|\b(?:klaim|berita|informasi|pernyataan|kabar|ini|itu)\b.{0,80}\b(?:benar|bener|salah|valid|akurat|bukti)\b|\b(?:benar|bener|salah|valid|akurat)\s+(?:atau|or)\s+(?:salah|benar|bener|invalid|inaccurate)\b)/iu;
const CASUAL_GREETING_OR_THANKS =
  /^(?:(?:halo|hai|hey|hi|yo|pagi|siang|malam|apa kabar|makasih|terima kasih|thanks?|thx|wkwk|haha)[\s!,.?]*)+$/iu;
const CASUAL_BANTER =
  /\b(?:wkwk+|haha+|hehe+|lol|lmao|bercanda|jokes?|lucu|ngakak|receh|roast|aura|mager|salting|muka bantal|baru bangun|belum mandi|blm mandi|sarkas(?:tik)?|sarkasin|dark jokes?|politik|satir|sindir(?:an)?|lawak|candaan|gokil|kocak)\b/iu;
const RELATIONSHIP_BANTER =
  /\b(?:saling\s+suka|jatuh\s+cinta|naksir|gebetan|jadian|pacaran|chemistry|bucin|cinlok|shipping|di-?ship|crush)\b/iu;
const CASUAL_SPECULATION =
  /\b(?:menurut(?:\s+(?:kamu|lu|loe|lo))?|menurutmu|kira[- ]?kira|kayaknya|bakal|tebak(?:an)?|guess)\b/iu;
const PRIVATE_DISCORD_CONTEXT =
  /(?:\b(?:discord|server\s+ini|di\s+(?:server|sini)|member|anggota|obrolan|chat|dia|mereka|orang\s+ini)\b|\bdi\s*discord\b)/iu;
const PLAYFUL_MYTH_OR_HYPOTHETICAL =
  /\b(?:mitos|katanya|konon)\b.{0,120}\b(?:jika|kalau|kalo|panggil|datang|muncul)\b/isu;
const EXPLICIT_RESEARCH_OR_CURRENT_INFO =
  /\b(?:cari(?:kan)?|search|find|telusuri|riset|research|sumber|source|referensi|rujukan|terbaru|latest|current|recent|update|hari ini|today|besok|tomorrow|cuaca|weather|prakiraan|forecast|harga|price|jadwal|schedule|rilis|release|breaking news)\b/iu;

function inferredMode(input: ResearchInput): ResearchMode {
  if (input.mode) return input.mode;
  if ((input.comparisonSources?.length ?? 0) > 0 || COMPARISON_QUESTION.test(input.question)) {
    return 'compare';
  }
  return VERIFICATION_QUESTION.test(input.question) ? 'verify' : 'answer';
}

export function buildResearchPlan(input: ResearchInput): ResearchPlan {
  const mode = inferredMode(input);
  const hasExternalUrl =
    input.source.urls.length > 0 || input.source.embeds.some((embed) => Boolean(embed.url));
  const hasVisualInput = input.source.images.length > 0;
  const casualSignal =
    CASUAL_GREETING_OR_THANKS.test(input.question.trim()) ||
    CASUAL_BANTER.test(input.question) ||
    RELATIONSHIP_BANTER.test(input.question) ||
    PLAYFUL_MYTH_OR_HYPOTHETICAL.test(input.question) ||
    (CASUAL_SPECULATION.test(input.question) && PRIVATE_DISCORD_CONTEXT.test(input.question));
  const interaction: ResearchInteraction =
    mode === 'answer' &&
    (casualSignal || (hasVisualInput && !EXPLICIT_RESEARCH_OR_CURRENT_INFO.test(input.question)))
      ? 'casual'
      : 'research';

  if (interaction === 'casual') {
    return { mode, interaction, search: 'none', fetchSourceUrls: false };
  }
  if (mode === 'compare') {
    return { mode, interaction, search: 'per-target', fetchSourceUrls: true };
  }

  const shouldResearch =
    mode === 'verify' || hasExternalUrl || EXPLICIT_RESEARCH_OR_CURRENT_INFO.test(input.question);
  return {
    mode,
    interaction,
    search: shouldResearch ? 'single' : 'none',
    fetchSourceUrls: shouldResearch && hasExternalUrl,
  };
}
