// Isolamento de contexto entre pedidos sobre entidades diferentes.
//
// Bug real (10/08): estava aberto um pendente sobre "pedir a caderneta
// predial ao proprietário da Moradia na Alameda da República". O consultor
// escreveu depois, sem qualquer relação, "Contacta o Nuno Castilho".
// O motor tinha o pendente no payload do DECIDE e o motivo escorregou para
// o registo novo: "lembrete para lhe ligares a pedir a caderneta predial".
//
// Regra: um pedido novo sobre uma entidade que NÃO aparece no pendente não
// pode ver esse pendente nem herdar o seu "porquê". Fica genérico
// ("Contactar o Nuno Castilho") ou o Afonso pergunta o motivo.

import { foldText } from "@/lib/search/normalize";
import { extractExplicitNames } from "./outcome-target";

const STOPWORDS = new Set([
  "para", "pelo", "pela", "pelos", "pelas", "sobre", "quando", "onde", "como",
  "isto", "isso", "aquilo", "esta", "este", "essa", "esse", "aquele", "aquela",
  "hoje", "amanha", "ontem", "depois", "antes", "ainda", "agora", "tambem",
  "lhe", "lhes", "dele", "dela", "deles", "delas", "nele", "nela",
  "lembrete", "lembra", "lembrar", "ligar", "ligares", "contactar", "contacta",
  "afonso", "assessor", "favor", "obrigado", "obrigada",
]);

/** Palavras com conteúdo semântico (>=4 letras, sem acentos, sem banais). */
export function contentTokens(text: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const raw of foldText(String(text ?? "")).split(/[^a-z0-9]+/)) {
    if (raw.length < 4 || STOPWORDS.has(raw)) continue;
    out.add(raw);
  }
  return out;
}

/** Texto legível de um pendente (payload + pergunta + frase original). */
export function pendingContextText(pending: unknown): string {
  if (!pending || typeof pending !== "object") return "";
  const p = pending as Record<string, any>;
  const parts: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) parts.push(v);
  };
  push(p.intent);
  push(p.current_question);
  push(p.pending_question);
  push(p.original_content);
  push(p.goal);
  const payload = p.structured_payload;
  if (payload && typeof payload === "object") {
    const walk = (v: any, depth = 0) => {
      if (depth > 3 || v == null) return;
      if (typeof v === "string" || typeof v === "number") return push(String(v));
      if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
      if (typeof v === "object") Object.values(v).forEach((x) => walk(x, depth + 1));
    };
    walk(payload);
  }
  return parts.join(" ");
}

/**
 * O pendente tem alguma coisa a ver com esta mensagem?
 *
 * - Mensagem sem nomes próprios (ex.: "sim", "amanhã às 10") → assume-se
 *   continuação do pendente (relacionada), como sempre foi.
 * - Mensagem com nome(s) próprio(s): só é relacionada se pelo menos um deles
 *   aparecer no pendente, ou se houver sobreposição de palavras de conteúdo.
 */
export function isPendingRelated(message: string, pendingText: string): boolean {
  const pending = String(pendingText ?? "").trim();
  if (!pending) return true;
  const names = extractExplicitNames(message);
  if (!names.length) return true;

  const pendingTokens = contentTokens(pending);
  for (const name of names) {
    for (const tok of foldText(name).split(" ")) {
      if (tok.length >= 3 && pendingTokens.has(tok)) return true;
    }
  }
  // Sobreposição temática (ex.: "a caderneta do Nuno" com um pendente de
  // cadernetas) também conta como relacionado.
  const msgTokens = contentTokens(message);
  const nameTokens = new Set(names.flatMap((n) => foldText(n).split(" ")));
  for (const tok of msgTokens) {
    if (nameTokens.has(tok)) continue;
    if (pendingTokens.has(tok)) return true;
  }
  return false;
}

// Orações que carregam o "porquê" de um registo.
const MOTIVE_CLAUSE_RE =
  /(?:,\s*)?\s+(?:(?:a|para|de|por)\s+(?:pedir|pedires|enviar|enviares|tratar|tratares|falar|falares|combinar|combinares|confirmar|confirmares|entregar|entregares|receber|recolher|recolheres|marcar|marcares)|sobre|acerca de|relativamente a|por causa d[aeo]s?)\b[^.;\n!?]*/gi;

/**
 * Remove de `text` as orações de motivo cujo conteúdo vem apenas do pendente
 * não relacionado (nunca as que o consultor escreveu na própria mensagem).
 */
export function stripInheritedMotive(
  text: string | null | undefined,
  args: { message: string; pendingText: string },
): string {
  const raw = String(text ?? "");
  if (!raw.trim() || !args.pendingText.trim()) return raw;
  const msgTokens = contentTokens(args.message);
  const pendingTokens = contentTokens(args.pendingText);

  const cleaned = raw.replace(MOTIVE_CLAUSE_RE, (clause) => {
    const tokens = contentTokens(clause);
    let fromPending = false;
    for (const tok of tokens) {
      if (msgTokens.has(tok)) return clause; // veio do consultor: fica
      if (pendingTokens.has(tok)) fromPending = true;
    }
    return fromPending ? "" : clause;
  });

  return cleaned.replace(/\s{2,}/g, " ").replace(/\s+([.,;!?])/g, "$1").trim();
}

/**
 * Remove do payload de pesquisa o pendente (e o resumo de estado) quando o
 * pedido actual é sobre outra entidade. O DECIDE deixa de o ver e não pode
 * herdar dele nada.
 */
export function isolateUnrelatedPending<T extends Record<string, any>>(
  searches: T,
  message: string,
): { searches: T; isolated: boolean; pendingText: string } {
  const pending = (searches as any).pending_action ?? null;
  const pendingText = pendingContextText(pending);
  if (!pending || isPendingRelated(message, pendingText)) {
    return { searches, isolated: false, pendingText: "" };
  }
  const state = (searches as any).conversation_state;
  const next: any = { ...searches, pending_action: null };
  if (state && typeof state === "object") {
    next.conversation_state = {
      ...state,
      state_summary: null,
      goal: null,
      factual_summary: null,
      pending_action_id: null,
    };
  }
  return { searches: next as T, isolated: true, pendingText };
}