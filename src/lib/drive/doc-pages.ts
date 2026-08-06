// Documentos de várias páginas: quando o consultor fotografa uma caderneta
// página a página, cada foto chega como um ficheiro separado. Aqui decidimos
// se a nova página pertence ao mesmo documento e consolidamos as leituras
// numa só, para haver uma ligação única ao imóvel.

export interface PageReading {
  doc_type?: string | null;
  artigo_matricial?: string | null;
  fracao?: string | null;
  morada?: string | null;
  nif?: string | null;
  issued_on?: string | null;
  expires_on?: string | null;
  visible_text?: string | null;
}

/** Janela em que fotos seguidas contam como páginas do mesmo documento. */
export const DOC_PAGE_WINDOW_MS = 10 * 60 * 1000;

function norm(v?: string | null): string | null {
  const s = (v ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
  return s ? s : null;
}

function digits(v?: string | null): string | null {
  const s = (v ?? "").replace(/\D+/g, "");
  return s ? s : null;
}

function identifiers(r: PageReading): { artigo: string | null; nif: string | null; morada: string | null } {
  return { artigo: norm(r.artigo_matricial), nif: digits(r.nif), morada: norm(r.morada) };
}

/** A leitura não tem nada que a identifique (típico de páginas 2, 3…). */
export function isContinuationReading(r: PageReading): boolean {
  const id = identifiers(r);
  return !id.artigo && !id.nif && !id.morada && !norm(r.doc_type);
}

/**
 * A nova página pertence ao mesmo documento da anterior?
 * Identificadores diferentes (artigo/NIF/morada) travam sempre a junção.
 */
export function isSameDocument(prev: PageReading, next: PageReading): boolean {
  const a = identifiers(prev);
  const b = identifiers(next);
  const conflicts =
    (a.artigo && b.artigo && a.artigo !== b.artigo) ||
    (a.nif && b.nif && a.nif !== b.nif) ||
    (a.morada && b.morada && a.morada !== b.morada);
  if (conflicts) return false;
  if ((a.artigo && a.artigo === b.artigo) || (a.nif && a.nif === b.nif) || (a.morada && a.morada === b.morada)) {
    return true;
  }
  if (isContinuationReading(next)) return true;
  const ta = norm(prev.doc_type);
  const tb = norm(next.doc_type);
  return Boolean(ta && tb && ta === tb);
}

/**
 * Consolida as leituras por ordem de página: o primeiro valor conhecido de
 * cada campo ganha, e o texto visível é somado (é o que alimenta a ligação).
 */
export function mergeReadings(pages: PageReading[]): PageReading {
  const out: PageReading = {};
  const keys = ["doc_type", "artigo_matricial", "fracao", "morada", "nif", "issued_on", "expires_on"] as const;
  for (const page of pages) {
    for (const k of keys) {
      const val = page[k];
      if (!out[k] && val != null && String(val).trim() !== "") out[k] = String(val).trim();
    }
  }
  const text = pages
    .map((p) => (p.visible_text ?? "").trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20000);
  out.visible_text = text || null;
  return out;
}

/** Frase curta a confirmar que a página entrou no documento já existente. */
export function pageJoinedText(pageNumber: number, docLabel: string | null, linkLabel: string | null): string {
  const doc = docLabel?.trim() ? `de ${docLabel.trim()}` : "do mesmo documento";
  const base = `Página ${pageNumber} ${doc} — juntei à mesma leitura.`;
  return linkLabel ? `${base} Continua ligado a ${linkLabel}.` : base;
}