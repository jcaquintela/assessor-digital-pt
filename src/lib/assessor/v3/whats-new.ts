// "O que há de novo?" — deteção e formatação das novidades do produto.
// Módulo puro: o caller trata da leitura da tabela product_updates.

export interface ProductUpdate {
  released_on: string;
  title: string;
  description: string;
  category: string;
}

// "o que há de novo", "que novidades tens", "tiveste atualizações",
// "houve alguma novidade", "melhoraste em quê".
const WHATS_NEW_RE =
  /\b(?:(?:o\s+)?que\s+(?:h[áa]|tens|trazes)\s+de\s+novo|novidades?|atualiza[çc][õo]es|actualiza[çc][õo]es|nova\s+vers[ãa]o|o\s+que\s+mudou|o\s+que\s+h[áa]\s+de\s+diferente)\b/i;

// Perguntas de competências não são novidades ("o que sabes fazer?").
const CAPABILITIES_RE =
  /\b(?:sabes\s+fazer|consegues\s+fazer|compet[êe]ncias|para\s+que\s+serves|o\s+que\s+fazes)\b/i;

export function detectWhatsNewQuery(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (CAPABILITIES_RE.test(t)) return false;
  return WHATS_NEW_RE.test(t);
}

const CATEGORY_ORDER: Record<string, number> = {
  nova_funcionalidade: 0,
  melhoria: 1,
  correcao: 2,
};

export const NO_UPDATES_REPLY =
  "Não tenho novidades novas para te contar deste último mês. Continuo com tudo o que já fazia.";

// Fallback quando não há nada no último mês mas há novidades mais antigas.
export function noRecentUpdatesReply(last?: ProductUpdate | null): string {
  if (!last) return NO_UPDATES_REPLY;
  const desc = humanizeUpdateText(last.description);
  return `Este último mês não trouxe novidades novas. A última coisa que aprendi foi *${humanizeUpdateText(last.title)}* — ${desc}`;
}

// Vocabulário técnico que nunca deve chegar ao consultor numa novidade.
// Chave = expressão técnica, valor = como um assessor humano diria.
const TECH_REWRITES: Array<[RegExp, string]> = [
  [/\b(tabela|coluna|schema|migra[çc][ãa]o|base\s+de\s+dados)\b/gi, "registo"],
  [/\b(endpoint|api|webhook|payload|json|token|uuid|id\b)/gi, "ligação"],
  [/\b(backend|frontend|servidor|deploy|build|commit|cron)\b/gi, "sistema"],
  [/\b(bug|stack\s*trace|log|refactor(?:ing|iza[çc][ãa]o)?|patch)\b/gi, "ajuste"],
  [/\b(RLS|pol[íi]tica\s+de\s+acesso|query|SQL|cache|flag)\b/gi, "definição"],
  [/\b(prompt|tool[- ]?call(?:ing)?|LLM|modelo\s+de\s+IA|parser)\b/gi, "forma de perceber"],
];

/** true se o texto contém vocabulário técnico. */
export function isTechnicalText(text: string): boolean {
  return TECH_REWRITES.some(([re]) => {
    re.lastIndex = 0;
    return re.test(text ?? "");
  });
}

/** Substitui vocabulário técnico por linguagem normal e limpa o texto. */
export function humanizeUpdateText(text: string): string {
  let out = String(text ?? "");
  for (const [re, replacement] of TECH_REWRITES) {
    re.lastIndex = 0;
    out = out.replace(re, replacement);
  }
  return out.replace(/\s{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

/**
 * Valida e limpa uma novidade antes de a mostrar: título e descrição passam
 * pela reescrita humana; entradas sem título ou sem descrição são descartadas.
 */
export function sanitizeUpdates(updates: ProductUpdate[]): ProductUpdate[] {
  return (updates ?? [])
    .map((u) => ({
      ...u,
      title: humanizeUpdateText(u.title),
      description: humanizeUpdateText(u.description),
    }))
    .filter((u) => u.title.length > 0 && u.description.length > 3);
}

/** Ordena por data (mais recente primeiro) e depois por relevância. */
export function rankUpdates(updates: ProductUpdate[]): ProductUpdate[] {
  return [...updates].sort((a, b) => {
    const d = String(b.released_on).localeCompare(String(a.released_on));
    if (d !== 0) return d;
    return (CATEGORY_ORDER[a.category] ?? 3) - (CATEGORY_ORDER[b.category] ?? 3);
  });
}

export function formatWhatsNewReply(updates: ProductUpdate[], limit = 5): string {
  const ranked = rankUpdates(sanitizeUpdates(updates));
  if (!ranked.length) return NO_UPDATES_REPLY;
  const shown = ranked.slice(0, limit);
  const lines = shown.map((u) => `- *${u.title}* — ${u.description}`);
  const resto = ranked.length - shown.length;
  const tail = resto > 0
    ? `\n_E mais ${resto} ${resto === 1 ? "melhoria" : "melhorias"} pelo caminho._`
    : "";
  return `Ando a aprender coisas novas. As mais recentes:\n${lines.join("\n")}${tail}`;
}