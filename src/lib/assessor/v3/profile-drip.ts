// Perfil do consultor "por gotas" — fase 1: zona de atuação e equipa.
//
// Extensão do arranque leve (nome + objetivos). Nada aqui bloqueia trabalho:
// uma pergunta de perfil é sempre uma gota, nunca um formulário.
//
// Regras (todas obrigatórias, ver golden tests):
// - Travas do arranque leve mantidas: nunca depois de uma pergunta do Afonso,
//   nunca com trabalho em curso — excepto quando há âncora contextual (logo a
//   seguir a uma ferramenta bem-sucedida, ex. placa registada).
// - Máximo 1 pergunta por dia, nunca 2 na mesma conversa.
// - Só sai em dia calmo OU com âncora contextual (a âncora tem prioridade).
// - Teto de 6 perguntas em 30 dias; ao esgotar, desiste em definitivo.
// - 2 recusas seguidas → pausa de 7 dias.
// - Consultores existentes recebem um aviso de transição, uma única vez.
//
// Módulo puro: quem lê/escreve no perfil é ./profile-drip.server.ts.

export type ProfileQuestionKey = "work_area" | "team_context";

export interface AskedEntry {
  key: string;
  at: string;
}

export interface ProfileDripState {
  workArea: string | null;
  teamContext: string | null;
  asked: AskedEntry[];
  lastQuestionAt: string | null;
  refusalStreak: number;
  pausedUntil: string | null;
  noticeSentAt: string | null;
  /** Consultor que já usava o Afonso antes desta funcionalidade. */
  isExistingConsultant: boolean;
}

export interface DripContext {
  now?: Date;
  /** A resposta do Afonso já termina em pergunta. */
  replyIsQuestion: boolean;
  /** Há trabalho em curso (proposta viva, sparring, execução pendente). */
  busyWithTask: boolean;
  /** Âncora contextual deste turno (ex.: "prospecting_lead" após registo). */
  anchor?: ProfileQuestionKey | null;
  /** Dia calmo: NBA ativo ou sinal Crescimento/Produtividade baixo. */
  calmDay: boolean;
  /** O arranque leve (nome/objetivos) ainda está a decorrer. */
  onboardingPending?: boolean;
  /** Já saiu uma pergunta de perfil nesta conversa. */
  askedInThisConversation?: boolean;
}

export const MAX_QUESTIONS_30D = 6;
export const REFUSALS_BEFORE_PAUSE = 2;
export const PAUSE_DAYS = 7;
export const PROFILE_QUESTION_TTL_MS = 24 * 60 * 60_000;
export const PROFILE_QUESTION_INTENT = "profile_question";

export const TRANSITION_NOTICE =
  "Vou começar a conhecer-te melhor, para te ajudar mais no dia a dia. Nada de formulários — de vez em quando faço uma pergunta curta, respondes se te der jeito.";

export const QUESTION_ORDER: ProfileQuestionKey[] = ["work_area", "team_context"];

export const WORK_AREA_QUESTION =
  "Em que zona trabalhas sobretudo? Ajuda-me a perceber o que é mercado teu.";

export const WORK_AREA_ANCHOR_QUESTION =
  "Já agora: é essa a tua zona principal de trabalho, ou foi de passagem?";

export const TEAM_QUESTION =
  "Trabalhas sozinho ou tens equipa contigo? Muda a forma como te dou apoio.";

export const WORK_AREA_SAVED_REPLY = (area: string) =>
  `Fica anotado: ${area}. Vou ter isso em conta.`;
export const TEAM_SAVED_REPLY = "Fica anotado — vou ter isso em conta.";

export function questionText(key: ProfileQuestionKey, anchored = false): string {
  if (key === "work_area") return anchored ? WORK_AREA_ANCHOR_QUESTION : WORK_AREA_QUESTION;
  return TEAM_QUESTION;
}

const REFUSAL_RE =
  /\b(depois|agora\s+n[ãa]o|deixa|logo\s+vejo|n[ãa]o\s+(quero|interessa|sei|respondo)|passo|tanto\s+faz|indiferente)\b/i;

const TASK_RE =
  /\b(regista|registar|marca|marcar|agenda|agendar|lembra|lembrar|liga|ligar|apaga|apagar|cria|criar|adiciona|adicionar|mostra|mostrar|envia|enviar|procura|procurar|quantos?|quais)\b/i;

function ymdLisbon(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Perguntas feitas nos últimos 30 dias. */
export function askedInLast30Days(state: ProfileDripState, now: Date = new Date()): number {
  const cut = now.getTime() - 30 * 864e5;
  return state.asked.filter((a) => {
    const t = new Date(a.at).getTime();
    return Number.isFinite(t) && t >= cut;
  }).length;
}

export interface DripOffer {
  key: ProfileQuestionKey;
  question: string;
  /** O aviso de transição sai colado a esta pergunta (uma só vez). */
  withNotice: boolean;
  anchored: boolean;
}

/** Que pergunta de perfil (se alguma) pode sair agora. */
export function nextProfileQuestion(
  state: ProfileDripState,
  ctx: DripContext,
): DripOffer | null {
  const now = ctx.now ?? new Date();
  if (ctx.onboardingPending) return null;
  if (ctx.askedInThisConversation) return null;
  if (ctx.replyIsQuestion) return null;

  const anchor = ctx.anchor ?? null;
  // A âncora relaxa a trava de "trabalho em curso": é exactamente logo a
  // seguir a uma ferramenta bem-sucedida que a pergunta é natural.
  if (ctx.busyWithTask && !anchor) return null;

  if (state.pausedUntil && new Date(state.pausedUntil).getTime() > now.getTime()) return null;
  if (askedInLast30Days(state, now) >= MAX_QUESTIONS_30D) return null;

  // Máximo uma por dia (dia de Lisboa).
  if (state.lastQuestionAt) {
    const last = new Date(state.lastQuestionAt);
    if (Number.isFinite(last.getTime()) && ymdLisbon(last) === ymdLisbon(now)) return null;
  }

  const answered = new Set<ProfileQuestionKey>();
  if (state.workArea) answered.add("work_area");
  if (state.teamContext) answered.add("team_context");
  const alreadyAsked = new Set(state.asked.map((a) => a.key));

  const key = QUESTION_ORDER.find((k) => !answered.has(k) && !alreadyAsked.has(k)) ?? null;
  if (!key) return null;

  // Âncora tem prioridade sobre o calendário; sem âncora exige dia calmo.
  const anchored = anchor === key;
  if (!anchored && !ctx.calmDay) return null;

  return {
    key,
    question: questionText(key, anchored),
    withNotice: state.isExistingConsultant && !state.noticeSentAt,
    anchored,
  };
}

/** Compõe o texto final (aviso de transição + pergunta) sobre a resposta. */
export function composeDripReply(reply: string, offer: DripOffer): string {
  const base = (reply ?? "").trim();
  const tail = offer.withNotice ? `${TRANSITION_NOTICE}\n\n${offer.question}` : offer.question;
  return base ? `${base}\n\n${tail}` : tail;
}

export type DripAnswer =
  | { kind: "value"; text: string }
  | { kind: "skip" }
  | { kind: "not_an_answer" };

export function readProfileAnswer(key: ProfileQuestionKey, raw: string): DripAnswer {
  const text = String(raw ?? "").trim();
  if (!text) return { kind: "not_an_answer" };
  if (REFUSAL_RE.test(text) && text.length < 40) return { kind: "skip" };
  if (TASK_RE.test(text)) return { kind: "not_an_answer" };
  if (text.length < 2) return { kind: "not_an_answer" };
  const limit = key === "work_area" ? 120 : 200;
  return { kind: "value", text: text.slice(0, limit) };
}

// ── Consumo: zona de atuação enviesa a pesquisa de imóveis ────────────────

function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Pedaços úteis da zona de atuação ("Porto e Matosinhos" → [porto, matosinhos]). */
export function workAreaTokens(workArea: string | null | undefined): string[] {
  return norm(workArea)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3 && !["e", "de", "da", "do", "zona", "area"].includes(t));
}

/**
 * Reordena resultados de imóveis dando vantagem aos que caem na zona do
 * consultor. Sem zona conhecida devolve a mesma ordem — comportamento atual.
 */
export function rankByWorkArea<T extends Record<string, unknown>>(
  rows: T[],
  workArea: string | null | undefined,
): T[] {
  const tokens = workAreaTokens(workArea);
  if (!tokens.length) return rows;
  const score = (r: T) => {
    const hay = norm([r.location, r.city, r.address, r.title].filter(Boolean).join(" "));
    return tokens.some((t) => hay.includes(t)) ? 1 : 0;
  };
  return rows
    .map((row, i) => ({ row, i, s: score(row) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.row);
}
