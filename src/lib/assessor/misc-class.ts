// Classificação à nascença de tudo o que entra em Diversos.
//
// Duas naturezas muito diferentes partilhavam o mesmo sítio:
//  - "genuino": o consultor quis mesmo guardar isto (nota, tarefa solta).
//  - "falha_interpretacao": o Afonso não percebeu, não conseguiu executar,
//    ou uma proposta ficou por confirmar. É trabalho nosso, não dele.
//
// Fonte única usada pelos quatro caminhos de escrita em miscellaneous_items.

export type MiscClass = "genuino" | "falha_interpretacao";

export type MiscSource =
  | "safety_net"        // rede de segurança do motor v3
  | "superseded"        // proposta substituída antes de confirmar
  | "register_only"     // consultor pediu "só regista, sem lembrete"
  | "tool_save_misc"    // ferramenta save_miscellaneous (decisão do motor)
  | "fallback_save"     // motor não classificou noutro módulo
  | "proactive"         // proatividade esgotada (nudges sem resposta)
  | "dashboard";        // criado à mão no painel

const FAILURE_SOURCES = new Set<MiscSource>(["safety_net", "superseded", "proactive"]);

export function initialMiscClass(input: {
  source: MiscSource;
  /** Resultado do turno, quando existe (motor v3). */
  outcome?: string | null;
  tags?: string[] | null;
  category?: string | null;
}): MiscClass {
  if (FAILURE_SOURCES.has(input.source)) return "falha_interpretacao";

  const outcome = String(input.outcome ?? "").trim();
  if (outcome === "tool_failed" || outcome === "not_understood" || outcome === "service_down") {
    return "falha_interpretacao";
  }

  const tags = (input.tags ?? []).map((t) => String(t ?? "").toLowerCase());
  if (tags.some((t) => t === "falha_assessor" || t.startsWith("tec:"))) {
    return "falha_interpretacao";
  }

  return "genuino";
}

/** Classificação de registos já existentes, a partir do que ficou gravado. */
export function classifyExistingMisc(row: {
  tags?: string[] | null;
  category?: string | null;
  title?: string | null;
}): MiscClass {
  const tags = (row.tags ?? []).map((t) => String(t ?? "").toLowerCase());
  if (tags.some((t) => t === "falha_assessor" || t.startsWith("tec:") || t === "proatividade_esgotada")) {
    return "falha_interpretacao";
  }
  if (/^proposta n[ãa]o confirmada:/i.test(String(row.title ?? "").trim())) {
    return "falha_interpretacao";
  }
  return "genuino";
}

export const MISC_CLASS_LABEL: Record<MiscClass, string> = {
  genuino: "Nota tua",
  falha_interpretacao: "Falhei a perceber",
};
