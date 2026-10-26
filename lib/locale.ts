export const REPLY_LANGUAGE_RULE = `Language:
Reply in the same language as the user's message. If they write in Portuguese, use European Portuguese (pt-PT), not Brazilian Portuguese. If they write in English, reply in English. If the language is mixed or unclear, use European Portuguese (pt-PT). When you ask a specialist, write the question and the context in that same language.`;

const PORTUGUESE_WORD = /\b(não|nao|que|para|com|uma|uns|umas|está|estão|estao|quero|preciso|olá|ola|bom|boa|dia|visita|têm|tem|sobre|também|tambem|obrigad[oa]|quero|sugere|problema)\b/gi;
const ENGLISH_WORD = /\b(the|and|for|with|want|please|what|this|that|hello|who|recommend|products|prices|wants|confirm)\b/gi;

export function prefersEnglish(text: string) {
  const marks = (text.match(/[ãõçáàâéêíóôú]/gi) ?? []).length;
  const portuguese = (text.match(PORTUGUESE_WORD) ?? []).length + marks;
  const english = (text.match(ENGLISH_WORD) ?? []).length;
  return english > portuguese;
}
