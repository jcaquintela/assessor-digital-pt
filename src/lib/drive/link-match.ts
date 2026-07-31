// Matching puro entre o texto de um documento e os registos do consultor.
// Sem I/O — é aqui que decidimos se vale a pena SUGERIR uma ligação extra.
// Nunca liga nada: só devolve candidatos com um motivo legível.

export type LinkableType = "person" | "property" | "opportunity";

export const LINKABLE_LABEL: Record<LinkableType, string> = {
  person: "Pessoa",
  property: "Imóvel",
  opportunity: "Negócio",
};

export interface LinkTarget {
  entityType: LinkableType;
  entityId: string;
  label: string;
}

export interface LinkCandidate extends LinkTarget {
  score: number;
  reason: string;
}

export function normalizeForMatch(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set([
  "de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "em", "na", "no",
  "com", "para", "por", "um", "uma", "rua", "av", "avenida", "sem", "titulo",
  "imovel", "negocio", "venda", "compra", "casa",
]);

function tokens(value: string): string[] {
  return normalizeForMatch(value)
    .split(" ")
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

/**
 * Devolve os registos claramente mencionados no texto, ordenados por confiança.
 * Regra conservadora: só entra quem tiver pelo menos um termo distintivo
 * (>= 4 letras) presente e 60% ou mais dos seus termos no texto.
 */
export function matchEntities(text: string, targets: LinkTarget[]): LinkCandidate[] {
  const haystack = ` ${normalizeForMatch(text)} `;
  if (haystack.trim().length < 3) return [];

  const out: LinkCandidate[] = [];
  for (const t of targets) {
    const label = String(t.label ?? "").trim();
    if (!label) continue;
    const full = normalizeForMatch(label);
    const parts = tokens(label);
    if (parts.length === 0) continue;

    if (full.length >= 5 && haystack.includes(` ${full} `)) {
      out.push({ ...t, score: 1, reason: `"${label}" aparece no documento` });
      continue;
    }

    const hits = parts.filter((p) => haystack.includes(` ${p} `));
    const distinctive = hits.filter((h) => h.length >= 4);
    const ratio = hits.length / parts.length;
    if (distinctive.length > 0 && ratio >= 0.6) {
      out.push({
        ...t,
        score: Math.min(0.95, 0.5 + ratio * 0.45),
        reason: `menciona ${hits.join(", ")}`,
      });
    }
  }

  return out.sort((a, b) => b.score - a.score);
}