// Uma correção fecha a pergunta rejeitada nesse turno. O modelo pode pedir
// desculpa e, por contaminação do histórico, repetir exactamente a mesma
// pergunta; este filtro determinístico impede esse ciclo.

function normalizeQuestion(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[*_]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function questions(value: string): string[] {
  return value
    .split(/(?<=\?)/)
    .map((part) => part.trim())
    .filter((part) => part.includes("?"));
}

export function suppressRejectedQuestion(reply: string, previousAssistantReply: string): string {
  const rejected = new Set(questions(previousAssistantReply).map(normalizeQuestion).filter(Boolean));
  if (!rejected.size || !reply.includes("?")) return reply.trim();

  return reply
    .split(/(?<=[.!?])\s+/)
    .filter((part) => !part.includes("?") || !rejected.has(normalizeQuestion(part)))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}