// Arranque leve de um consultor novo: duas perguntas oferecidas, nunca
// impostas. Módulo puro — quem chama trata da leitura/escrita no perfil.
//
// Regras (não negociáveis):
// - Nunca bloqueia um pedido real: se o consultor pede algo concreto, isso
//   vem sempre primeiro e a pergunta cai.
// - Nunca insiste: ignorada uma vez, não se repete na mesma conversa.
// - No máximo duas ofertas, com dias de intervalo.

export type OnboardingStage =
  | "not_started"
  | "name_asked"
  | "goals_asked"
  | "skipped"
  | "done";

export interface OnboardingState {
  stage: OnboardingStage;
  offers: number;
  lastOfferAt: string | null;
  goals: string | null;
}

export const MAX_OFFERS = 2;
export const REOFFER_AFTER_DAYS = 3;

export const NAME_QUESTION = (current: string) =>
  `Já agora: como preferes chamar-me? Posso ficar ${current}, ou preferes outro nome?`;

export const GOALS_QUESTION =
  "O que procuras mais em mim, para começares com o pé direito — organizar o dia a dia, não perder nenhum contacto, apoio no negócio, ou outra coisa?";

export const NAME_KEPT_REPLY = (name: string) => `Fico ${name}, então.`;
export const NAME_SET_REPLY = (name: string) => `A partir de agora sou o ${name}.`;
export const GOALS_SAVED_REPLY = "Fica anotado — vou ter isso em conta.";

// Verbos e formas típicas de um pedido concreto. Se aparecerem, a mensagem
// é trabalho, não resposta ao arranque.
const TASK_RE =
  /\b(regista|registar|marca|marcar|agenda|agendar|lembra|lembrar|liga|ligar|apaga|apagar|cria|criar|adiciona|adicionar|mostra|mostrar|envia|enviar|procura|procurar|quanto|quantos|quais|o\s+que\s+tenho|visita|placa|proposta|comiss[ãa]o|amanh[ãa]|hoje)\b/i;

const REFUSAL_RE =
  /\b(depois|agora\s+n[ãa]o|deixa|logo\s+vejo|n[ãa]o\s+(quero|interessa|sei)|passo|tanto\s+faz|indiferente)\b/i;

const KEEP_NAME_RE =
  /\b(fica(s)?\s+(assim|bem|como\s+est[áa])|assim\s+est[áa]\s+bem|mantém|mantem|pode\s+ficar|est[áa]\s+bom|gosto\s+assim|sim)\b/i;

const NAME_TOKEN_RE = /^[\p{L}][\p{L}'’-]{1,29}$/u;

// Cláusulas de cortesia/condicionais que antecedem o nome real.
// Bug real: "Se não te importares, fica Vanessa" era lido como "não",
// porque o "Se" inicial casava com o padrão "sê X".
const COURTESY_PREFIX_RE =
  /^\s*(?:se\s+(?:n[ãa]o\s+)?(?:te\s+|lhe\s+)?(?:importares|importas|importa|faz\s+diferen[çc]a|for\s+poss[íi]vel)\s*[,.:;-]*\s*|por\s+favor\s*[,.:;-]*\s*|olha\s*[,.:;-]*\s*|ent[ãa]o\s*[,.:;-]*\s*|acho\s+que\s+|na\s+verdade\s*[,.:;-]*\s*)+/iu;

// Palavras que nunca podem ser lidas como nome do Assessor.
const NOT_A_NAME = new Set([
  "não", "nao", "sim", "assim", "bem", "como", "isso", "igual", "tudo",
  "melhor", "claro", "ok", "talvez", "antes", "depois", "agora", "que",
]);

export type NameAnswer =
  | { kind: "keep" }
  | { kind: "rename"; name: string }
  | { kind: "skip" }
  | { kind: "not_an_answer" };

/** Interpreta a resposta à pergunta do nome. Conservador por desenho. */
export function readNameAnswer(raw: string): NameAnswer {
  const text = (raw ?? "").trim().replace(COURTESY_PREFIX_RE, "").trim();
  if (!text) return { kind: "not_an_answer" };

  // "fica Vanessa" / "chama-me Vanessa" são inequívocos e têm prioridade
  // sobre recusas e sobre "fica assim".
  const strong = text.match(
    /\b(?:fica(?:s)?|chama[-\s]?me|chama[-\s]?te|passas?\s+a\s+ser|podes\s+(?:ser|ficar))\s+(?:o\s+|a\s+)?([\p{L}][\p{L}'’-]{1,29})/iu,
  );
  const strongName = strong?.[1];
  if (strongName && !NOT_A_NAME.has(strongName.toLowerCase())) {
    return { kind: "rename", name: strongName };
  }

  if (REFUSAL_RE.test(text)) return { kind: "skip" };
  if (KEEP_NAME_RE.test(text)) return { kind: "keep" };

  // "prefiro Rui", "sê Rui"
  const explicit = text.match(
    /\b(?:chamar[-\s]?te|prefiro|prefer[íi]a|s[ê])\s+(?:o\s+|a\s+)?([\p{L}][\p{L}'’-]{1,29})/iu,
  );
  if (explicit?.[1] && !NOT_A_NAME.has(explicit[1].toLowerCase())) {
    return { kind: "rename", name: explicit[1] };
  }

  if (TASK_RE.test(text)) return { kind: "not_an_answer" };

  // Nome solto ("Rui", "Rui Miguel").
  const words = text.replace(/[.!?,]/g, "").split(/\s+/);
  if (
    words.length <= 2 &&
    words.every((w) => NAME_TOKEN_RE.test(w) && !NOT_A_NAME.has(w.toLowerCase()))
  ) {
    return { kind: "rename", name: words.join(" ") };
  }
  return { kind: "not_an_answer" };
}

export type GoalsAnswer =
  | { kind: "goals"; text: string }
  | { kind: "skip" }
  | { kind: "not_an_answer" };

/** Interpreta a resposta livre sobre o que o consultor procura. */
export function readGoalsAnswer(raw: string): GoalsAnswer {
  const text = (raw ?? "").trim();
  if (!text) return { kind: "not_an_answer" };
  if (REFUSAL_RE.test(text) && text.length < 40) return { kind: "skip" };
  if (TASK_RE.test(text)) return { kind: "not_an_answer" };
  if (text.length < 3) return { kind: "not_an_answer" };
  return { kind: "goals", text: text.slice(0, 500) };
}

/**
 * Que pergunta (se alguma) pode ser oferecida agora.
 * `replyIsQuestion` e `busyWithTask` travam sempre a oferta.
 */
export function nextOnboardingOffer(
  state: OnboardingState,
  opts: { now?: Date; replyIsQuestion: boolean; busyWithTask: boolean },
): "name" | "goals" | null {
  if (opts.replyIsQuestion || opts.busyWithTask) return null;
  if (state.stage === "done") return null;
  if (state.offers >= MAX_OFFERS) return null;

  if (state.stage === "not_started") return "name";

  // Já ofereceu e ficou sem resposta: só volta a oferecer dias depois,
  // e uma única vez.
  if (state.stage === "skipped" || state.stage === "name_asked" || state.stage === "goals_asked") {
    const last = state.lastOfferAt ? new Date(state.lastOfferAt).getTime() : 0;
    const now = (opts.now ?? new Date()).getTime();
    if (!last || now - last < REOFFER_AFTER_DAYS * 864e5) return null;
    return state.goals ? "name" : (state.stage === "goals_asked" ? "goals" : "name");
  }
  return null;
}

/** Junta a pergunta de arranque à resposta normal, sem a atropelar. */
export function appendOffer(reply: string, question: string): string {
  const base = (reply ?? "").trim();
  return base ? `${base}\n\n${question}` : question;
}
