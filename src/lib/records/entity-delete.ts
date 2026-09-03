// Fase 3 da eliminação permanente — Pessoas, Imóveis e Negócios.
//
// Aqui vivem só as regras puras (sem BD): o que bloqueia, o que se pode
// anonimizar e como se escreve o marcador de anonimização. O servidor e a UI
// partilham este ficheiro para nunca darem respostas diferentes ao consultor.
//
// Porquê bloqueios: quando existe dinheiro pelo meio, a lei obriga a guardar o
// registo contabilístico (retenção fiscal 10 anos, branqueamento 7 anos). Nesses
// casos não se elimina — no caso das pessoas, anonimiza-se.

export type EntityDeleteType = "person" | "property" | "opportunity";

export const ENTITY_LABEL: Record<EntityDeleteType, string> = {
  person: "pessoa",
  property: "imóvel",
  opportunity: "negócio",
};

/** Etapas/estados que já não contam como negócio "vivo". */
const CLOSED_LOST = new Set(["perdido", "cancelado"]);
const CLOSED_WON = new Set(["concluido", "concluído", "fechado", "ganho"]);

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

/** Negócio ainda em curso (nem perdido nem concluído). */
export function isDealOpen(deal: { stage?: unknown; status?: unknown }): boolean {
  const s = norm(deal?.stage) || norm(deal?.status);
  if (!s) return true;
  return !CLOSED_LOST.has(s) && !CLOSED_WON.has(s);
}

/** Negócio perdido — o único que não deixa rasto contabilístico relevante. */
export function isDealLost(deal: { stage?: unknown; status?: unknown }): boolean {
  const s = norm(deal?.stage) || norm(deal?.status);
  return CLOSED_LOST.has(s);
}

/** Um registo só pode ser eliminado depois de arquivado. */
export function isEntityArchived(type: EntityDeleteType, row: Record<string, unknown>): boolean {
  if (row?.["archived_at"]) return true;
  const status = norm(row?.["status"]);
  return type === "property" && (status === "arquivado" || status === "arquivada");
}

/** Marcador que substitui a identidade de uma pessoa anonimizada. */
export function anonymizedName(id: string): string {
  return `Pessoa anonimizada #${String(id).slice(0, 8)}`;
}

export function isAnonymizedPerson(row: { name?: unknown }): boolean {
  return /^pessoa anonimizada #/i.test(String(row?.name ?? ""));
}

export interface CascadeCount {
  /** Texto já pronto para a UI, ex.: "3 interações". */
  label: string;
  count: number;
}

export interface EntityDeleteAssessment {
  type: EntityDeleteType;
  id: string;
  /** Nome do registo, para o aviso do modal. */
  alvo: string;
  archived: boolean;
  /** Pode ser eliminado para sempre? */
  canDelete: boolean;
  /** Bloqueado por dependências legais/contabilísticas? */
  blocked: boolean;
  blockReasons: string[];
  /** Só pessoas bloqueadas podem ser anonimizadas. */
  canAnonymize: boolean;
  anonymized: boolean;
  cascade: CascadeCount[];
}

/** "3 interações" / "1 interação" — plural simples em PT-PT. */
export function contagem(count: number, singular: string, plural: string): CascadeCount {
  return { label: `${count} ${count === 1 ? singular : plural}`, count };
}

export const NOT_ARCHIVED_ENTITY_MESSAGE =
  "Só podes eliminar definitivamente um registo já arquivado. Arquiva primeiro.";

export const BLOCKED_MESSAGE_DEAL =
  "Este negócio tem movimentos financeiros associados. Por obrigação legal de retenção, não pode ser eliminado.";
