// Resolução da entidade a que uma resposta de resultado se refere.
//
// Bug real (08/08): o consultor escreveu "O Sr. Coelho desistiu de tudo" e o
// Afonso fechou "Reunião de equipa" — um check-in pendente de outro dia. Ele
// agiu com confiança sobre a entidade errada.
//
// Regra: um nome próprio explícito na frase manda sempre sobre qualquer item
// pendente em memória de curto prazo. Havendo ambiguidade real, pergunta-se.

import { foldText } from "@/lib/search/normalize";

export interface OutcomeCandidate {
  id: string;
  title: string;
  /** Nome da pessoa ligada ao seguimento, quando existe. */
  personName?: string | null;
  /** Título do imóvel/negócio ligado, quando existe. */
  contextTitle?: string | null;
}

export type OutcomeTargetDecision =
  | { kind: "apply"; target: OutcomeCandidate }
  | { kind: "ask"; options: OutcomeCandidate[] }
  | { kind: "none" };

// Tratamentos ("Sr. Coelho", "Dona Ana") — sinal forte de nome próprio.
const TITLED_NAME_RE =
  /\b(?:sr\.?a?|senhora?|sra\.?|dona?|d\.|dr\.?a?|eng\.?[ºoa]?|prof\.?)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ'-]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ'-]+){0,2})/g;

// Nomes próprios soltos (maiúscula inicial), fora do início da frase.
const CAPITALIZED_RE = /([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ'-]{2,}(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ'-]{2,}){0,2})/g;

const NOT_A_NAME = new Set([
  "sr","sra","senhor","senhora","dona","dr","dra","eng","prof",
  "ola","bom","boa","dia","tarde","noite","hoje","amanha","ontem","obrigado","obrigada",
  "sim","nao","ok","certo","reuniao","visita","chamada","lembrete","seguimento","nota",
  "afonso","assessor","equipa","segunda","terca","quarta","quinta","sexta","sabado","domingo",
  "janeiro","fevereiro","marco","abril","maio","junho","julho","agosto","setembro",
  "outubro","novembro","dezembro","desistiu","cancela","esquece","fica",
]);

/** Nomes próprios explícitos na frase, normalizados. Vazio quando não há. */
export function extractExplicitNames(text: string | null | undefined): string[] {
  const raw = String(text ?? "");
  if (!raw.trim()) return [];
  const out: string[] = [];

  for (const m of raw.matchAll(TITLED_NAME_RE)) {
    const name = m[1]?.trim();
    if (name) out.push(name);
  }

  // Fora do primeiro token da frase, para não apanhar "Registei", "Ontem"...
  const withoutTitled = raw.replace(TITLED_NAME_RE, " ");
  for (const sentence of withoutTitled.split(/[.!?\n]+/)) {
    const body = sentence.replace(/^\s*\S+\s*/, " "); // descarta a 1ª palavra
    for (const m of body.matchAll(CAPITALIZED_RE)) {
      const name = m[1]?.trim();
      if (name) out.push(name);
    }
  }

  const seen = new Set<string>();
  const names: string[] = [];
  for (const n of out) {
    const folded = foldText(n);
    const first = folded.split(" ")[0] ?? "";
    if (!folded || NOT_A_NAME.has(folded) || NOT_A_NAME.has(first)) continue;
    if (seen.has(folded)) continue;
    seen.add(folded);
    names.push(n.trim());
  }
  return names;
}

function candidateMatchesName(c: OutcomeCandidate, name: string): boolean {
  const hay = foldText([c.title, c.personName, c.contextTitle].filter(Boolean).join(" "));
  const tokens = foldText(name).split(" ").filter((t) => t.length >= 3);
  if (!tokens.length) return false;
  return tokens.some((t) => hay.includes(t));
}

/**
 * Decide sobre que seguimento aplicar o resultado.
 *
 * - Com nome explícito: só candidatos que o mencionem. Um → aplica.
 *   Vários → pergunta. Nenhum → nunca cai no pendente (seria a entidade
 *   errada); devolve "none" para o motor tratar como conversa normal.
 * - Sem nome explícito: usa o pendente (check-in/lembrete recente).
 */
export function decideOutcomeTarget(args: {
  text: string;
  pending: OutcomeCandidate | null;
  candidates: OutcomeCandidate[];
}): OutcomeTargetDecision {
  const names = extractExplicitNames(args.text);
  if (!names.length) {
    return args.pending ? { kind: "apply", target: args.pending } : { kind: "none" };
  }

  const pool = [
    ...(args.pending ? [args.pending] : []),
    ...args.candidates.filter((c) => c.id !== args.pending?.id),
  ];
  const matches = pool.filter((c) => names.some((n) => candidateMatchesName(c, n)));

  if (matches.length === 1) return { kind: "apply", target: matches[0]! };
  if (matches.length > 1) return { kind: "ask", options: matches.slice(0, 3) };
  return { kind: "none" };
}

/** Pergunta curta quando há mais do que uma entidade possível. */
export function askWhichTarget(options: OutcomeCandidate[]): string {
  const list = options.map((o) => `"${o.title}"`).join(" ou ");
  return `Estás a falar de ${list}?`;
}
