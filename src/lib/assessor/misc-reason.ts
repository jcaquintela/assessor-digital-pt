// Porque é que esta nota está em Diversos.
// O consultor tem de perceber a razão sem abrir a ficha.

export type MiscReasonKey =
  | "nao_percebi"
  | "falhou_execucao"
  | "sem_capacidade"
  | "servico_em_baixo"
  | "por_confirmar"
  | "ficheiro"
  | "nota";

export interface MiscReason {
  key: MiscReasonKey;
  label: string;
  detail: string;
}

const LABELS: Record<MiscReasonKey, string> = {
  nao_percebi: "Não percebi o pedido",
  falhou_execucao: "Falhou ao executar",
  sem_capacidade: "Ainda não sei fazer isto",
  servico_em_baixo: "Serviço indisponível na altura",
  por_confirmar: "Proposta ficou por confirmar",
  ficheiro: "Ficheiro sem destino claro",
  nota: "Nota guardada",
};

const DETAILS: Record<MiscReasonKey, string> = {
  nao_percebi: "Guardei aqui para não se perder — diz-me o que fazer com isto.",
  falhou_execucao: "Percebi o pedido, mas não consegui concluir a ação.",
  sem_capacidade: "Não consegui executar este pedido — falta-me essa capacidade ainda.",
  servico_em_baixo: "Não consegui responder na altura por indisponibilidade temporária.",
  por_confirmar: "Chegou outro assunto antes de confirmares esta proposta.",
  ficheiro: "Recebi um ficheiro e não tenho a certeza a que registo pertence.",
  nota: "Ficou registado como nota, sem ação associada.",
};

export const MISC_REASON_DETAILS = DETAILS;

// Traduz o motivo técnico do motor (nome de ferramenta, código de erro) para
// uma das categorias legíveis. O texto técnico nunca é mostrado ao consultor.
export function classifyTechnicalReason(raw: string | null | undefined): MiscReasonKey {
  const t = String(raw ?? "").toLowerCase().trim();
  if (!t) return "nao_percebi";
  if (/act sem ferramenta|no[_ ]tool|sem ferramenta|capacidade/.test(t)) return "sem_capacidade";
  if (/indispon|service[_ ]down|rate[_ ]limit|timeout|429|503/.test(t)) return "servico_em_baixo";
  if (/not[_ ]found|invalid[_ ]args|tool[_ ]failed|error|erro|:|não consegui guardar/.test(t)) {
    return "falhou_execucao";
  }
  return "nao_percebi";
}

// Texto em PT, única fonte do que o consultor lê.
export function humanReason(key: MiscReasonKey): string {
  return DETAILS[key];
}

export function miscReason(item: {
  title?: string | null;
  summary?: string | null;
  category?: string | null;
  tags?: string[] | null;
}): MiscReason {
  const tags = (item.tags ?? []).map((t) => t.toLowerCase());
  const summary = (item.summary ?? "").toLowerCase();
  const title = (item.title ?? "").toLowerCase();

  let key: MiscReasonKey = "nota";
  if (title.startsWith("proposta não confirmada") || summary.includes("por confirmar")) {
    key = "por_confirmar";
  } else if (summary.includes(DETAILS.sem_capacidade.toLowerCase()) || summary.includes("act sem ferramenta")) {
    key = "sem_capacidade";
  } else if (summary.includes("indispon") || summary.includes("service_down")) {
    key = "servico_em_baixo";
  } else if (summary.includes("tool_failed") || summary.includes("não consegui concluir") || summary.includes("não consegui")) {
    key = "falhou_execucao";
  } else if (tags.includes("falha_assessor") || summary.includes("not_understood") || summary.includes("não percebi")) {
    key = "nao_percebi";
  } else if (tags.includes("ficheiro") || (item.category ?? "").toLowerCase().includes("ficheiro")) {
    key = "ficheiro";
  }

  // O texto natural em PT prevalece SEMPRE sobre o resumo técnico do motor:
  // nada de nomes de ferramenta ou códigos de erro à frente do consultor.
  return { key, label: LABELS[key], detail: DETAILS[key] };
}
