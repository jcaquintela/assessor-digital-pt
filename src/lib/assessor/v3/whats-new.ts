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

/** Ordena por data (mais recente primeiro) e depois por relevância. */
export function rankUpdates(updates: ProductUpdate[]): ProductUpdate[] {
  return [...updates].sort((a, b) => {
    const d = String(b.released_on).localeCompare(String(a.released_on));
    if (d !== 0) return d;
    return (CATEGORY_ORDER[a.category] ?? 3) - (CATEGORY_ORDER[b.category] ?? 3);
  });
}

export function formatWhatsNewReply(updates: ProductUpdate[], limit = 5): string {
  const ranked = rankUpdates(updates);
  if (!ranked.length) return NO_UPDATES_REPLY;
  const shown = ranked.slice(0, limit);
  const lines = shown.map((u) => `- *${u.title}* — ${u.description}`);
  const resto = ranked.length - shown.length;
  const tail = resto > 0
    ? `\n_E mais ${resto} ${resto === 1 ? "melhoria" : "melhorias"} pelo caminho._`
    : "";
  return `Ando a aprender coisas novas. As mais recentes:\n${lines.join("\n")}${tail}`;
}