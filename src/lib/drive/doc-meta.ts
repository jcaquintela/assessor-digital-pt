// Regras puras do Drive Inteligente: nomes ilegíveis, nome sugerido a partir
// do que foi lido no documento e alertas de validade.

/** Nomes que o consultor não reconhece na lista ("SCAN_20260803_0012.pdf"). */
export function isIllegibleName(name: string | null | undefined): boolean {
  const n = String(name ?? "").trim();
  if (!n) return true;
  const base = n
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/\(\s*\d+\s*\)\s*$/, "")
    .trim();
  if (!base) return true;
  if (/^[\d\s._-]+$/.test(base)) return true;
  if (
    /^(scan|img|image|photo|foto|doc|document|documento|file|ficheiro|pdf|whatsapp[\s_-]?(image|document)?|screenshot|captura|cam|dsc|gopro|untitled|sem[\s_-]?nome)[\s._-]*[\d\s._-]*$/i.test(
      base,
    )
  ) {
    return true;
  }
  // "20260803_0012", "0012-3456"
  if (/^[a-z]{0,4}[\d._-]{6,}$/i.test(base)) return true;
  return false;
}

function slugPart(v: string): string {
  return v.replace(/\s+/g, " ").replace(/[\\/:*?"<>|]+/g, "").trim();
}

/**
 * Nome legível a partir do que foi lido: "Caderneta Predial - Moradia Gaia".
 * Devolve null quando não há dados suficientes para melhorar o nome.
 */
export function suggestDocumentName(reading: {
  doc_type?: string | null;
  title_hint?: string | null;
  morada?: string | null;
  fracao?: string | null;
}): string | null {
  const hint = reading.title_hint ? slugPart(reading.title_hint) : "";
  if (hint.length >= 6) return hint.slice(0, 90);
  const tipo = reading.doc_type ? slugPart(reading.doc_type) : "";
  if (!tipo) return null;
  const local = reading.morada ? slugPart(reading.morada).split(",")[0] : "";
  const fr = reading.fracao ? `Fração ${slugPart(reading.fracao)}` : "";
  return [tipo, local || fr].filter(Boolean).join(" - ").slice(0, 90);
}

export type ExpiryLevel = "expirado" | "urgente" | "aviso";

export interface ExpiryAlert {
  level: ExpiryLevel;
  days: number;      // negativo = já passou
  reason: string;    // frase curta em PT-PT
}

/** Documentos com validade legal por tempo de emissão (meses). */
const VALIDADE_POR_EMISSAO: { match: RegExp; meses: number; nome: string }[] = [
  { match: /certid[ãa]o\s+permanente/i, meses: 6, nome: "Certidão Permanente" },
  { match: /certid[ãa]o\s+de\s+teor/i, meses: 6, nome: "Certidão de teor" },
  { match: /caderneta\s+predial/i, meses: 12, nome: "Caderneta Predial" },
];

const DIA = 864e5;

/**
 * Avalia se um documento está a ficar fora de prazo.
 * `soonDays` é a janela de antecedência (por omissão 45 dias).
 */
export function expiryAlert(
  file: {
    doc_expires_on?: string | null;
    doc_issued_on?: string | null;
    document_type?: string | null;
    classification?: string | null;
    original_file_name?: string | null;
  },
  now: Date = new Date(),
  soonDays = 45,
): ExpiryAlert | null {
  const hoje = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  if (file.doc_expires_on) {
    const t = Date.parse(`${file.doc_expires_on}T00:00:00Z`);
    if (!Number.isNaN(t)) {
      const days = Math.round((t - hoje) / DIA);
      if (days < 0) return { level: "expirado", days, reason: `caducou há ${Math.abs(days)} dias` };
      if (days === 0) return { level: "urgente", days, reason: "caduca hoje" };
      if (days <= 14) return { level: "urgente", days, reason: `caduca em ${days} dias` };
      if (days <= soonDays) return { level: "aviso", days, reason: `caduca em ${days} dias` };
      return null;
    }
  }

  if (file.doc_issued_on) {
    const texto = [file.document_type, file.classification, file.original_file_name]
      .filter(Boolean)
      .join(" ");
    const regra = VALIDADE_POR_EMISSAO.find((r) => r.match.test(texto));
    if (!regra) return null;
    const t = Date.parse(`${file.doc_issued_on}T00:00:00Z`);
    if (Number.isNaN(t)) return null;
    const limite = new Date(t);
    limite.setUTCMonth(limite.getUTCMonth() + regra.meses);
    const days = Math.round((limite.getTime() - hoje) / DIA);
    if (days < 0)
      return {
        level: "expirado",
        days,
        reason: `foi emitida há mais de ${regra.meses} meses — já não serve`,
      };
    if (days <= 14) return { level: "urgente", days, reason: `deixa de servir em ${days} dias` };
    if (days <= soonDays) return { level: "aviso", days, reason: `deixa de servir em ${days} dias` };
  }

  return null;
}
