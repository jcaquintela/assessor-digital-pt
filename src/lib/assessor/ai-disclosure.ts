// DISCLOSURE DE IA — obrigação legal (Art. 50 do AI Act).
//
// Qualquer primeira interação, em qualquer canal (WhatsApp, Telegram,
// dashboard), tem de deixar claro e visível que do outro lado está um
// sistema de IA. Não pode depender do nome do contacto: esse é controlado
// pelo utilizador, não por nós. Por isso a frase vai sempre no PRIMEIRO
// parágrafo da mensagem de boas-vindas, nunca em rodapé.

export const AI_DISCLOSURE = "Sou um assistente de IA — o Afonso.";

/** Frase completa de abertura, com saudação opcional pelo primeiro nome. */
export function aiDisclosureOpening(name?: string | null): string {
  const n = String(name ?? "").trim();
  return `Olá${n ? ` ${n}` : ""}! ${AI_DISCLOSURE}`;
}

/** Garante o disclosure no início de um texto de boas-vindas. */
export function withAiDisclosure(text: string): string {
  return text.includes(AI_DISCLOSURE) ? text : `${AI_DISCLOSURE} ${text}`;
}