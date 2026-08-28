export const RESEARCH_SCOPE_REFUSAL =
  'I cannot expose private instructions or credentials, or help find explicit sexual content.';

export type ResearchGuardReason = 'secret_or_prompt_extraction' | 'explicit_sexual_content';

export type ResearchGuardDecision =
  | { allowed: true }
  | { allowed: false; reason: ResearchGuardReason };

const EXTRACTION_PATTERNS = [
  /\b(?:reveal|show|print|repeat|quote|leak|expose|tampilkan|cetak|ulangi|bocorkan|ungkapkan)\b.{0,80}\b(?:system prompt|developer message|hidden prompt|instructions|secret|token|api key|credential|prompt sistem|pesan developer|instruksi tersembunyi|rahasia|kredensial)\b/isu,
  /\b(?:what is|give me|tell me|apa|berikan|sebutkan)\b.{0,50}\b(?:your api key|your token|system prompt|developer message|hidden instructions|api key kamu|token kamu|prompt sistem)\b/isu,
];

const EXPLICIT_SEXUAL_CONTENT_PATTERNS = [
  /\b(?:cari(?:in|kan)?|carikan|find|search|recommend|rekomendasi|kasih|beri(?:kan)?|minta|link|download|nonton|watch)\b.{0,100}\b(?:bokep|porn(?:o|ography)?|video dewasa|sex tape|konten seksual|hentai)\b/isu,
  /\b(?:bokep|porn(?:o|ography)?|video dewasa|sex tape|konten seksual|hentai)\b.{0,80}\b(?:lokal|videos?|link|sites?|website|download|nonton|watch)\b/isu,
];

const INDONESIAN_SIGNAL =
  /\b(?:aku|kamu|gue|gw|lu|lo|tolong|buat|cari|jelaskan|kenapa|nggak|gak|dong|saya|anda)\b/iu;

export function assessResearchQuestion(question: string): ResearchGuardDecision {
  const normalizedQuestion = question.normalize('NFKC');

  if (EXTRACTION_PATTERNS.some((pattern) => pattern.test(normalizedQuestion))) {
    return { allowed: false, reason: 'secret_or_prompt_extraction' };
  }

  if (EXPLICIT_SEXUAL_CONTENT_PATTERNS.some((pattern) => pattern.test(normalizedQuestion))) {
    return { allowed: false, reason: 'explicit_sexual_content' };
  }

  return { allowed: true };
}

export function buildResearchGuardRefusal(
  question: string,
  reason: ResearchGuardReason,
): string {
  const usesIndonesian = INDONESIAN_SIGNAL.test(question);

  if (reason === 'secret_or_prompt_extraction') {
    return usesIndonesian
      ? 'Aku nggak bisa membocorkan prompt internal, token, atau kredensial. Tapi aku tetap bisa jelasin cara kerja bot ini secara umum.'
      : "I can't expose private prompts, tokens, or credentials, but I can explain how the bot works at a high level.";
  }

  return usesIndonesian
    ? 'Aku nggak bisa bantu mencari atau membagikan konten seksual eksplisit. Kalau konteksnya edukasi, kesehatan, atau keamanan, tanya langsung aja.'
    : "I can't help find or share explicit sexual content. I can still help with educational, health, or safety questions.";
}

const REFUSAL_RESPONSE_PATTERNS = [
  /^(?:i\s+)?(?:can(?:not|'t)|won't)\s+(?:help|assist|provide|find|search|expose)\b/iu,
  /^(?:maaf[,.]?\s*)?(?:saya|aku)\s+(?:tidak bisa|nggak bisa|tak dapat)\s+(?:membantu|mencarikan|memberikan|menyediakan|membocorkan)\b/iu,
];

export function isResearchRefusal(content: string): boolean {
  const normalized = content.trim();
  return (
    normalized.toLocaleLowerCase('en-US') ===
      RESEARCH_SCOPE_REFUSAL.toLocaleLowerCase('en-US') ||
    REFUSAL_RESPONSE_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

export function guardResearchOutput(content: string): string {
  const normalizedContent = content.toLowerCase();
  const leaksInternalPrompt =
    normalizedContent.includes('replai application rules') ||
    normalizedContent.includes('security and scope rules (highest priority)') ||
    normalizedContent.includes('you are replai, a contextual discord research assistant') ||
    normalizedContent.includes('you are replai, a discord research assistant');

  return leaksInternalPrompt ? RESEARCH_SCOPE_REFUSAL : content;
}
