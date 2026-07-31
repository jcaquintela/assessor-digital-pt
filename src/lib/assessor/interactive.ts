// Camada de interação por botões (módulo puro, sem I/O).
//
// Sempre que o Afonso faz uma pergunta de resposta fechada, deixa de fazer
// sentido pedir "Sim"/"Não" escritos: enviamos botões tocáveis. A decisão
// passa a vir de um id determinístico, não de texto livre — acaba de vez a
// ambiguidade entre "Sim", "Ainda não", "ok", etc.
//
// Regras (WhatsApp Cloud API):
//  - até 3 opções  -> Interactive Reply Buttons (type: "button")
//  - 4 a 10 opções -> List Message (type: "list")
//  - fora da janela de 24h ou erro no envio -> texto simples (fallback)

export interface InteractiveOption {
  /** id enviado ao canal; codifica o texto canónico que o motor deve receber. */
  id: string;
  /** rótulo visível no botão. */
  label: string;
  description?: string | null;
}

export interface InteractivePrompt {
  kind: "buttons" | "list";
  body: string;
  options: InteractiveOption[];
  /** rótulo do botão que abre a lista (só em kind === "list"). */
  listButtonLabel?: string;
}

const ID_PREFIX = "afonso:t:";

/**
 * Comando canónico de resultado de seguimento. Vai codificado no id do botão
 * e é interceptado na ingestão antes do motor — o registo é actualizado na
 * hora, tal como nas confirmações de placa.
 */
export const OUTCOME_COMMAND_PREFIX = "#resultado:";

export type FollowUpOutcome = "concluido" | "precisa_nova_acao" | "nao_realizado";

export const OUTCOME_LABEL: Record<FollowUpOutcome, string> = {
  concluido: "Correu bem",
  precisa_nova_acao: "Precisa seguimento",
  nao_realizado: "Sem efeito",
};

export function encodeOutcomeCommand(followUpId: string, outcome: FollowUpOutcome): string {
  return `${OUTCOME_COMMAND_PREFIX}${followUpId}:${outcome}`;
}

export function parseOutcomeCommand(
  text: string | null | undefined,
): { followUpId: string; outcome: FollowUpOutcome } | null {
  const raw = String(text ?? "").trim();
  if (!raw.startsWith(OUTCOME_COMMAND_PREFIX)) return null;
  const [followUpId, outcome] = raw.slice(OUTCOME_COMMAND_PREFIX.length).split(":");
  if (!followUpId || !outcome) return null;
  if (!(outcome in OUTCOME_LABEL)) return null;
  return { followUpId, outcome: outcome as FollowUpOutcome };
}

/** Pergunta de check-in da tarde: 3 botões, os mesmos estados de "Aguardam resultado". */
export function buildOutcomeCheckinPrompt(item: {
  id: string;
  title: string;
  entity_label?: string | null;
}): InteractivePrompt {
  const who = item.entity_label ? ` (${item.entity_label})` : "";
  return {
    kind: "buttons",
    body: `Como correu "${item.title}"${who}?`,
    options: (Object.keys(OUTCOME_LABEL) as FollowUpOutcome[]).map((o) => ({
      id: encodeInteractiveId(encodeOutcomeCommand(item.id, o)),
      label: OUTCOME_LABEL[o],
      description: null,
    })),
  };
}

export const BUTTON_LABEL_MAX = 20;
export const LIST_LABEL_MAX = 24;
export const LIST_DESCRIPTION_MAX = 72;
export const MAX_BUTTONS = 3;
export const MAX_LIST_ROWS = 10;

/** Codifica no id o texto canónico que o motor deve processar. */
export function encodeInteractiveId(canonicalText: string): string {
  return `${ID_PREFIX}${encodeURIComponent(canonicalText.trim())}`.slice(0, 200);
}

/** Devolve o texto canónico de um id nosso, ou null se o id não for nosso. */
export function decodeInteractiveId(id: string | null | undefined): string | null {
  const raw = String(id ?? "");
  if (!raw.startsWith(ID_PREFIX)) return null;
  try {
    const text = decodeURIComponent(raw.slice(ID_PREFIX.length)).trim();
    return text || null;
  } catch {
    return null;
  }
}

/**
 * Resolve a resposta a um botão: o id manda sempre. Só se o id não for nosso
 * (teclado antigo, mensagem legada) é que caímos no rótulo escrito.
 */
export function resolveInteractiveReply(
  id: string | null | undefined,
  label: string | null | undefined,
): string {
  return decodeInteractiveId(id) ?? String(label ?? "").trim();
}

function truncate(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function option(label: string, canonicalText: string, description?: string): InteractiveOption {
  return {
    id: encodeInteractiveId(canonicalText),
    label,
    description: description ? truncate(description, LIST_DESCRIPTION_MAX) : null,
  };
}

const QUESTION_RE = /\?\s*$/;
const CHOICE_QUESTION_RE = /\b(qual|quais|a qual|escolhe|escolher|referes|refere-te|dos?\s+dois|delas?|deles?)\b/i;
const SAME_ONE_RE = /\b[ée]\s+a\s+mesma\b/i;

function enumeratedOptions(reply: string): string[] {
  return reply
    .split("\n")
    .map((l) => l.match(/^\s*-\s+(.+?)\s*$/)?.[1] ?? null)
    .filter((v): v is string => Boolean(v && v.length));
}

/**
 * Decide se esta resposta deve seguir como mensagem interativa.
 * Devolve null quando a resposta é texto normal (nada muda).
 */
export function deriveInteractivePrompt(
  reply: string | null | undefined,
  ctx: { hasPendingConfirmation: boolean },
): InteractivePrompt | null {
  const body = String(reply ?? "").trim();
  if (!body || !body.includes("?")) return null;

  // 1) Desambiguação entre vários registos parecidos: as opções já vêm
  //    enumeradas com "- " e a pergunta é de escolha.
  if (CHOICE_QUESTION_RE.test(body)) {
    const items = enumeratedOptions(body);
    if (items.length >= 2) {
      const capped = items.slice(0, MAX_LIST_ROWS);
      const kind = capped.length <= MAX_BUTTONS ? "buttons" : "list";
      const max = kind === "buttons" ? BUTTON_LABEL_MAX : LIST_LABEL_MAX;
      return {
        kind,
        body,
        options: capped.map((item) =>
          option(truncate(item.replace(/[*_]/g, ""), max), item.replace(/[*_]/g, ""), item),
        ),
        listButtonLabel: "Ver opções",
      };
    }
  }

  // 2) Confirmação de um rascunho por confirmar (a pergunta fecha a mensagem).
  if (ctx.hasPendingConfirmation && QUESTION_RE.test(body)) {
    if (SAME_ONE_RE.test(body)) {
      return {
        kind: "buttons",
        body,
        options: [option("É a mesma", "sim"), option("Registar outra", "quero registar outra")],
      };
    }
    return {
      kind: "buttons",
      body,
      options: [option("Sim", "sim"), option("Ainda não", "não")],
    };
  }

  return null;
}
