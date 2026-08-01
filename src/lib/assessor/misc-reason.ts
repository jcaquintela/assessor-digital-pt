// Porque é que esta nota está em Diversos.
// O consultor tem de perceber a razão sem abrir a ficha.

export type MiscReasonKey =
  | "nao_percebi"
  | "falhou_execucao"
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
  servico_em_baixo: "Serviço indisponível na altura",
  por_confirmar: "Proposta ficou por confirmar",
  ficheiro: "Ficheiro sem destino claro",
  nota: "Nota guardada",
};

const DETAILS: Record<MiscReasonKey, string> = {
  nao_percebi: "Guardei aqui para não se perder — diz-me o que fazer com isto.",
  falhou_execucao: "Percebi o pedido, mas não consegui concluir a ação.",
  servico_em_baixo: "Não consegui responder na altura por indisponibilidade temporária.",
  por_confirmar: "Chegou outro assunto antes de confirmares esta proposta.",
  ficheiro: "Recebi um ficheiro e não tenho a certeza a que registo pertence.",
  nota: "Ficou registado como nota, sem ação associada.",
};

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
  } else if (summary.includes("indispon") || summary.includes("service_down")) {
    key = "servico_em_baixo";
  } else if (summary.includes("tool_failed") || summary.includes("não consegui")) {
    key = "falhou_execucao";
  } else if (tags.includes("falha_assessor") || summary.includes("not_understood") || summary.includes("não percebi")) {
    key = "nao_percebi";
  } else if (tags.includes("ficheiro") || (item.category ?? "").toLowerCase().includes("ficheiro")) {
    key = "ficheiro";
  }

  // O resumo escrito pelo motor, quando existe, é mais específico que o genérico.
  const written = (item.summary ?? "").trim();
  return { key, label: LABELS[key], detail: written || DETAILS[key] };
}
