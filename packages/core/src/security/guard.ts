export const RESEARCH_SCOPE_REFUSAL =
  'I can only help with factual research, explanation, comparison, and verification.';

export type ResearchGuardReason =
  | 'prompt_injection'
  | 'secret_or_prompt_extraction'
  | 'out_of_scope_generation'
  | 'explicit_sexual_content';

export type ResearchGuardDecision =
  | { allowed: true }
  | { allowed: false; reason: ResearchGuardReason };

const PROMPT_INJECTION_PATTERNS = [
  /\b(?:ignore|disregard|forget|override|abaikan|lupakan|langgar|kesampingkan)\b.{0,80}\b(?:previous|prior|above|system|developer|instruction|instructions|prompt|rules|sebelumnya|di atas|sistem|instruksi|aturan|perintah)\b/isu,
  /\b(?:jailbreak|dan mode|unrestricted mode|bypass safety|bypass aturan|mode tanpa batas)\b/iu,
  /\b(?:enable|enter|activate|aktifkan|masuk)\b.{0,30}\b(?:developer mode|dan mode|mode developer)\b/isu,
  /\b(?:act as|pretend to be|berpura-pura menjadi|jadilah)\b.{0,80}\b(?:unrestricted|without rules|tanpa aturan|bebas batasan)\b/isu,
];

const EXTRACTION_PATTERNS = [
  /\b(?:reveal|show|print|repeat|quote|leak|expose|tampilkan|cetak|ulangi|bocorkan|ungkapkan)\b.{0,80}\b(?:system prompt|developer message|hidden prompt|instructions|secret|token|api key|credential|prompt sistem|pesan developer|instruksi tersembunyi|rahasia|kredensial)\b/isu,
  /\b(?:what is|give me|tell me|apa|berikan|sebutkan)\b.{0,50}\b(?:your api key|your token|system prompt|developer message|hidden instructions|api key kamu|token kamu|prompt sistem)\b/isu,
];

const OUT_OF_SCOPE_GENERATION_PATTERNS = [
  /\b(?:write|generate|create|build|buatkan|bikinkan|tuliskan|hasilkan)\b.{0,80}\b(?:code|script|program|bot|website|application|malware|exploit|kode|skrip|aplikasi)\b/isu,
  /\b(?:write|generate|create|buatkan|bikinkan|tuliskan)\b.{0,80}\b(?:poem|story|email|essay|homework|puisi|cerita|surat|makalah|pr sekolah)\b/isu,
];

const EXPLICIT_SEXUAL_CONTENT_PATTERNS = [
  /\b(?:cari(?:in|kan)?|carikan|find|search|recommend|rekomendasi|kasih|beri(?:kan)?|minta|link|download|nonton|watch)\b.{0,100}\b(?:bokep|porn(?:o|ography)?|video dewasa|sex tape|konten seksual|hentai)\b/isu,
  /\b(?:bokep|porn(?:o|ography)?|video dewasa|sex tape|konten seksual|hentai)\b.{0,80}\b(?:lokal|videos?|link|sites?|website|download|nonton|watch)\b/isu,
];

export function assessResearchQuestion(question: string): ResearchGuardDecision {
  const normalizedQuestion = question.normalize('NFKC');

  if (PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(normalizedQuestion))) {
    return { allowed: false, reason: 'prompt_injection' };
  }

  if (EXTRACTION_PATTERNS.some((pattern) => pattern.test(normalizedQuestion))) {
    return { allowed: false, reason: 'secret_or_prompt_extraction' };
  }

  if (OUT_OF_SCOPE_GENERATION_PATTERNS.some((pattern) => pattern.test(normalizedQuestion))) {
    return { allowed: false, reason: 'out_of_scope_generation' };
  }

  if (EXPLICIT_SEXUAL_CONTENT_PATTERNS.some((pattern) => pattern.test(normalizedQuestion))) {
    return { allowed: false, reason: 'explicit_sexual_content' };
  }

  return { allowed: true };
}

const REFUSAL_RESPONSE_PATTERNS = [
  /^(?:i\s+)?(?:can(?:not|'t)|won't)\s+(?:help|assist|provide|find|search)\b/iu,
  /^(?:maaf[,.]?\s*)?(?:saya|aku)\s+(?:tidak bisa|nggak bisa|tak dapat)\s+(?:membantu|mencarikan|memberikan|menyediakan)\b/iu,
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
    normalizedContent.includes('security and scope rules (highest priority)') ||
    normalizedContent.includes('you are replai, a contextual discord research assistant') ||
    normalizedContent.includes('you are replai, a discord research assistant');

  return leaksInternalPrompt ? RESEARCH_SCOPE_REFUSAL : content;
}
