import type { ResearchInput, ResearchMode } from './types.js';

export type ResearchInteraction = 'conversation' | 'research';
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
const EXPLICIT_RESEARCH_REQUEST =
  /(?:\b(?:cari(?:in|kan)?\s+(?:sumber|referensi|berita|data)|search|telusuri|riset|research|sumber|source|referensi|rujukan|fact[ -]?check|cek fakta|verifikasi)\b|\bfind\s+(?:the\s+)?(?:original\s+)?(?:source|reference|news|data)\b)/iu;
const CURRENT_INFORMATION_REQUEST =
  /\b(?:terbaru|latest|current|recent|update|hari ini|today|besok|tomorrow|cuaca|weather|prakiraan|forecast|harga|price|jadwal|schedule|rilis|release|breaking news)\b/iu;
const CONVERSATION_FIRST_REQUEST =
  /\b(?:menurut(?:mu|\s+(?:kamu|lu|loe|lo|anda))?|pendapat|opini|what do you think|do you agree|setuju|pilih|vote|nilai|rate|roast|sarkas|sindir|joke|lawak|bercanda|wkwk+|haha+|caption|puisi|cerita|story|brainstorm|ide|curhat|naksir|gebetan|shipping|crush|saling suka|bucin|gimana rasanya|gimana menurut)\b/iu;
const PRIVATE_CONVERSATION_CONTEXT =
  /(?:\b(?:discord|server\s+ini|di\s+(?:server|sini)|member|anggota|obrolan|chat|dia|mereka|orang\s+ini)\b|\bdi\s*discord\b)/iu;

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
  const explicitResearch = EXPLICIT_RESEARCH_REQUEST.test(input.question);
  const currentInformation = CURRENT_INFORMATION_REQUEST.test(input.question);
  const conversationFirst =
    mode === 'answer' && CONVERSATION_FIRST_REQUEST.test(input.question) && !explicitResearch;
  const suppressUnrelatedUrlResearch =
    conversationFirst && PRIVATE_CONVERSATION_CONTEXT.test(input.question);

  if (mode === 'compare') {
    return { mode, interaction: 'research', search: 'per-target', fetchSourceUrls: true };
  }

  if (mode === 'verify') {
    return {
      mode,
      interaction: 'research',
      search: 'single',
      fetchSourceUrls: hasExternalUrl,
    };
  }

  const shouldResearch =
    explicitResearch ||
    (!conversationFirst && currentInformation) ||
    (hasExternalUrl && !suppressUnrelatedUrlResearch);
  return {
    mode,
    interaction: shouldResearch ? 'research' : 'conversation',
    search: shouldResearch ? 'single' : 'none',
    fetchSourceUrls: shouldResearch && hasExternalUrl,
  };
}
