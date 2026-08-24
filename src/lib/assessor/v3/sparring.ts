// Modo Sparring — treino de conversas difíceis (objeções de preço, comissão,
// exclusividade). Enquanto estiver activo, nada do que é dito vira registo.
//
// A entrada principal é EXPLÍCITA: o consultor escolhe "Treino de objeções" na
// app e o estado nasce desse clique (ver sparring-state.server.ts). Estes
// padrões são apenas a rede de segurança para pedidos por texto livre — foi
// aqui que o incidente de 24/08 falhou ("simulamos uma chamada a frio" não
// casava com `simula(r)?\b`, e não havia padrão para "treino de objeções").

const START_RE =
  /(treina(r)?\s+comigo|vamos\s+treinar|treino\s+de\s+objec?[çc][õo]es|modo\s+treino|simula(r|mos|va|ste)?\b|faz\s+de\s+conta\s+que\s+és|ajuda-me\s+a\s+(preparar|praticar)|pratica(r)?\s+(uma|a|as)?\s*objec?[çc][ãa]o|objec?[çc][õo]es\s+comigo|chamada\s+a\s+frio|role\s*play)/i;
// Saída só por comando explícito do consultor. "Obrigado" ficou de fora de
// propósito: dentro do roleplay é fala em personagem, não um pedido de saída.
const END_RE =
  /\b(chega|j[áa]\s+chega|para\s+com\s+isso|volta(mos)?\s+ao\s+normal|sai\s+do\s+(modo\s+)?treino|acaba(mos)?\s+(o\s+)?treino|terminar?\s+(o\s+)?treino|fim\s+do\s+treino|para\s+o\s+treino)\b/i;
const CONTINUE_RE = /^\s*(sim|claro|continua(r|mos)?|vamos|mais\s+uma|bora)\b/i;

/** Nº de trocas antes de o modo sair sozinho e perguntar se quer continuar. */
export const SPARRING_MAX_TURNS = 6;

/** Inatividade após a qual o treino deixa de estar activo (nunca fica preso). */
export const SPARRING_IDLE_MS = 30 * 60 * 1000;

/** O treino ficou esquecido: última troca há mais de SPARRING_IDLE_MS. */
export function isSparringStale(
  conversationState: unknown,
  now: Date = new Date(),
): boolean {
  const ts = (conversationState as { updated_at?: string | null } | null)?.updated_at;
  if (!ts) return false;
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return false;
  return now.getTime() - t > SPARRING_IDLE_MS;
}

export function detectSparringStart(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  return START_RE.test(t);
}

export function detectSparringEnd(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  return END_RE.test(t);
}

/** Depois de uma pausa automática, "sim/continua" retoma o treino. */
export function detectSparringContinue(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  return CONTINUE_RE.test(t);
}

export function isSparringPaused(conversationState: unknown): boolean {
  const topic = (conversationState as { active_topic?: string | null } | null)?.active_topic;
  return String(topic ?? "") === SPARRING_PAUSED_TOPIC;
}

export function sparringTurns(conversationState: unknown): number {
  const n = Number((conversationState as { sparring_turns?: number } | null)?.sparring_turns ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Estado activo lido do conversation_state. */
export function isSparringActive(conversationState: unknown): boolean {
  const topic = (conversationState as { active_topic?: string | null } | null)?.active_topic;
  return String(topic ?? "") === SPARRING_TOPIC;
}

export const SPARRING_TOPIC = "sparring";
export const SPARRING_PAUSED_TOPIC = "sparring_paused";

export const SPARRING_CONTINUE_QUESTION = "Já foram algumas trocas. Queres continuar o treino?";

export const SPARRING_PROMPT_BLOCK = `
MODO SPARRING (ACTIVO NESTE TURNO):
- O consultor pediu para treinar. Assumes o papel da outra pessoa (proprietário, comprador, investidor), com objecções realistas do mercado português: preço acima do mercado, comissão, exclusividade, prazo, "tenho outra agência".
- Responde em personagem, curto e credível. Sem emojis, sem elogio motivacional.
- NUNCA emitas tool_calls neste modo. Nada do que for dito pode virar registo. action tem de ser "acknowledge".
- Ao fim de poucas trocas, pergunta se quer continuar.
- Quando o consultor disser "chega", "obrigado" ou pedir para voltar ao normal, sais do modo e dás um comentário curto e concreto: o que resultou bem e o que podia ser mais forte. Nunca uma nota ou pontuação.
`;
