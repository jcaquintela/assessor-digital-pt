// Categoria automática de sistema do Drive Inteligente.
//
// Todo o ficheiro entra classificado: a categoria é derivada do tipo de
// ficheiro (classification) e do que foi lido (document_type). Função pura —
// nunca decide sozinha sobre a categoria manual do consultor, que continua a
// mandar sempre (custom_category_id).

export type SystemCategoryKey =
  | "notas_voz"
  | "prospecao"
  | "contactos"
  | "documentos"
  | "folhas"
  | "fotos"
  | "notas"
  | "outros";

export const SYSTEM_CATEGORY_LABEL: Record<SystemCategoryKey, string> = {
  notas_voz: "Notas de voz",
  prospecao: "Prospeção",
  contactos: "Cartões de visita",
  documentos: "Documentos",
  folhas: "Folhas de cálculo",
  fotos: "Fotos",
  notas: "Notas",
  outros: "Outros",
};

/** Ordem estável na vista por categoria. */
export const SYSTEM_CATEGORY_ORDER: SystemCategoryKey[] = [
  "notas_voz",
  "prospecao",
  "documentos",
  "contactos",
  "fotos",
  "folhas",
  "notas",
  "outros",
];

export function systemCategoryLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return SYSTEM_CATEGORY_LABEL[key as SystemCategoryKey] ?? null;
}

const norm = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/**
 * Categoria de sistema para um ficheiro. Nunca devolve null: um ficheiro sem
 * pistas nenhumas cai em "outros" — nada fica "por categorizar".
 */
export function systemCategoryFor(file: {
  classification?: string | null;
  document_type?: string | null;
  mime_type?: string | null;
}): SystemCategoryKey {
  const cls = norm(file.classification);
  const doc = norm(file.document_type);
  const mime = norm(file.mime_type);

  if (cls === "audio" || mime.startsWith("audio/")) return "notas_voz";
  if (cls === "prospecao" || /placa|vende-se|vendo|arrenda/.test(doc)) return "prospecao";
  if (/cartao (de )?(visita|contacto)|business card/.test(doc)) return "contactos";
  if (doc) return "documentos";
  if (cls.startsWith("documento") || mime === "application/pdf" || mime.includes("wordprocessingml"))
    return "documentos";
  if (cls === "planilha" || mime.includes("spreadsheetml") || mime === "text/csv") return "folhas";
  if (cls === "imagem" || mime.startsWith("image/")) return "fotos";
  if (cls === "texto" || mime === "text/plain") return "notas";
  return "outros";
}
