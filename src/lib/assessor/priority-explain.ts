// Traduz a pontuação interna de prioridade numa frase que o consultor entende.
// A pontuação (ex.: "55") não diz nada a ninguém; os fatores que a produzem, sim.

export interface ExplainInput {
  priority_score: number;
  reasons?: string[] | null;
  due_at?: string | null;
  entity_label?: string | null;
}

export function priorityLevel(score: number): "elevada" | "média" | "normal" {
  if (score >= 80) return "elevada";
  if (score >= 60) return "média";
  return "normal";
}

// Junta fatores em português natural: "a, b e c".
function juntar(partes: string[]): string {
  const p = partes.filter(Boolean);
  if (p.length === 0) return "";
  if (p.length === 1) return p[0];
  return `${p.slice(0, -1).join(", ")} e ${p[p.length - 1]}`;
}

// Os motivos vêm do motor em forma curta ("atrasado há 5 dias").
// Aqui viram oração completa.
function frasear(reason: string): string {
  const r = reason.trim().toLowerCase();
  if (!r) return "";
  if (r.startsWith("atrasado desde ontem")) return "está atrasado desde ontem";
  if (r.startsWith("atrasado há")) return `está ${r}`;
  if (r === "em atraso") return "está em atraso";
  if (r === "compromisso de hoje") return "é um compromisso de hoje";
  if (r === "compromisso próximo") return "é um compromisso próximo";
  if (r === "para hoje") return "está marcado para hoje";
  if (r === "próximo do prazo") return "está próximo do prazo";
  if (r === "prioridade alta") return "marcaste-o como prioridade alta";
  if (r === "oportunidade sem próxima ação" || r === "sem próxima ação") return "o negócio está sem próxima ação definida";
  if (r.startsWith("próxima ação atrasada desde ontem")) return "a próxima ação está atrasada desde ontem";
  if (r.startsWith("próxima ação atrasada há")) return `a ${r}`;
  if (r.startsWith("sem atividade há")) return `está ${r}`;
  if (r === "valor relevante") return "envolve um valor relevante";
  if (r === "com telefone disponível") return "há um número de telefone disponível";
  if (r === "com email disponível") return "há um email disponível";
  if (r.startsWith("pendente há")) return `está ${r}`;
  if (r === "aberto desde ontem") return "está aberto desde ontem";
  if (r.startsWith("marcado para as")) return `está ${r}`;
  if (r === "faz parte de um negócio em curso") return r;
  if (r === "ainda sem pessoa nem negócio associado") return "ainda não está ligado a ninguém nem a um negócio";
  return r;
}

/** Frase curta que explica porque é que isto está no topo do dia. */
export function explainPriority(p: ExplainInput): string {
  const nivel = priorityLevel(Number(p.priority_score ?? 0));
  const fatores = juntar((p.reasons ?? []).slice(0, 3).map(frasear).filter(Boolean));
  const prefixo = `Prioridade ${nivel}`;
  if (!fatores) return `${prefixo}.`;
  return `${prefixo}: ${fatores}.`;
}
