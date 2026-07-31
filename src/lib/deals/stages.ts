// Vocabulário único do Negócio (deal). Puro — importável no cliente e servidor.
// Um Negócio é o fio condutor: pessoa + imóvel(is) + fase + histórico.

export const DEAL_STAGES = [
  "preparacao",
  "angariacao",
  "promocao",
  "visitas",
  "proposta",
  "cpcv",
  "escritura",
  "concluido",
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

export const STAGE_LABEL: Record<DealStage, string> = {
  preparacao: "Preparação",
  angariacao: "Angariação",
  promocao: "Promoção",
  visitas: "Visitas",
  proposta: "Proposta",
  cpcv: "CPCV",
  escritura: "Escritura",
  concluido: "Concluído",
};

// Agrupamento do quadro: 4 colunas legíveis num relance.
export const STAGE_GROUPS: { key: string; label: string; stages: DealStage[] }[] = [
  { key: "inicio", label: "A começar", stages: ["preparacao", "angariacao"] },
  { key: "mercado", label: "No mercado", stages: ["promocao", "visitas"] },
  { key: "negociacao", label: "Em negociação", stages: ["proposta", "cpcv"] },
  { key: "fecho", label: "A fechar", stages: ["escritura", "concluido"] },
];

export function isDealStage(v: unknown): v is DealStage {
  return typeof v === "string" && (DEAL_STAGES as readonly string[]).includes(v);
}

export function normalizeStage(v: unknown): DealStage {
  return isDealStage(v) ? v : "preparacao";
}

export function stageIndex(v: unknown): number {
  return DEAL_STAGES.indexOf(normalizeStage(v));
}

export function groupOfStage(v: unknown): string {
  const s = normalizeStage(v);
  return STAGE_GROUPS.find((g) => g.stages.includes(s))?.key ?? "inicio";
}

export const DEAL_KINDS = [
  "venda",
  "compra",
  "arrendamento",
  "angariacao",
  "investimento",
  "outro",
] as const;
export type DealKind = (typeof DEAL_KINDS)[number];

export const KIND_LABEL: Record<DealKind, string> = {
  venda: "Venda",
  compra: "Compra",
  arrendamento: "Arrendamento",
  angariacao: "Angariação",
  investimento: "Investimento",
  outro: "Outro",
};

export function normalizeKind(v: unknown): DealKind {
  const s = String(v ?? "").trim().toLowerCase();
  const alias: Record<string, DealKind> = {
    venda: "venda",
    vender: "venda",
    compra: "compra",
    comprar: "compra",
    arrendamento: "arrendamento",
    arrendar: "arrendamento",
    angariacao: "angariacao",
    "angariação": "angariacao",
    "potencial angariação": "angariacao",
    investimento: "investimento",
    "recomendação": "outro",
  };
  return alias[s] ?? ((DEAL_KINDS as readonly string[]).includes(s) ? (s as DealKind) : "outro");
}

export const PROPERTY_ROLE_LABEL: Record<string, string> = {
  principal: "Principal",
  alternativa: "Alternativa",
  comparavel: "Comparável",
  descartada: "Descartada",
};

// ---- Saúde do negócio -------------------------------------------------
// O consultor não quer um score: quer saber se algo está parado ou em risco.

export type DealAlert = {
  level: "ok" | "atencao" | "risco";
  label: string;
} | null;

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

export function dealAlert(input: {
  lastActivityAt?: string | null;
  deadline?: string | null;
  nextActionAt?: string | null;
  stage?: string | null;
  now?: Date;
}): DealAlert {
  const now = input.now ?? new Date();
  const stage = normalizeStage(input.stage);
  if (stage === "concluido") return null;

  if (input.deadline) {
    const d = new Date(input.deadline);
    const dias = daysBetween(now, d);
    if (dias < 0) return { level: "risco", label: `Prazo passou há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"}` };
    if (dias <= 3) return { level: "atencao", label: dias === 0 ? "Prazo é hoje" : `Prazo em ${dias} dia${dias === 1 ? "" : "s"}` };
  }

  if (input.nextActionAt) {
    const d = new Date(input.nextActionAt);
    const dias = daysBetween(d, now);
    if (dias > 0) return { level: "risco", label: `Próxima ação atrasada ${dias} dia${dias === 1 ? "" : "s"}` };
  }

  if (input.lastActivityAt) {
    const parado = daysBetween(new Date(input.lastActivityAt), now);
    if (parado >= 21) return { level: "risco", label: `Parado há ${parado} dias` };
    if (parado >= 10) return { level: "atencao", label: `Parado há ${parado} dias` };
  }

  if (!input.nextActionAt) return { level: "atencao", label: "Sem próxima ação" };
  return null;
}
