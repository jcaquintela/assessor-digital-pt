// Resolução obrigatória de negócio antes de escrever.
//
// Mesmo molde de `resolvePersonForWrite` / `resolvePropertyForWrite`: quem
// escreve nunca decide sozinho. Três vias, por ordem de confiança:
//
//   1) negócio em foco na conversa (o consultor acabou de falar dele);
//   2) pessoa ou imóvel mencionados neste turno;
//   3) título por palavras de identidade — nunca `includes` cru.
//
// Estados: linked | confirm_partial | choose | none.

import { isDealActive } from "./stages";
import { foldText } from "@/lib/search/normalize";

export interface DealCandidate {
  id: string;
  title?: string | null;
  stage?: string | null;
  status?: string | null;
  person_id?: string | null;
  property_id?: string | null;
  archived_at?: string | null;
}

export type DealResolutionStatus = "none" | "linked" | "confirm_partial" | "choose";

export interface DealResolution {
  status: DealResolutionStatus;
  dealId: string | null;
  said: string | null;
  candidates: DealCandidate[];
}

export interface ResolveDealCtx {
  supabase: any;
  userId: string;
  /** Negócio já em foco nesta conversa (estado conversacional). */
  focusDealId?: string | null;
  /** Pessoa/imóvel resolvidos neste turno. */
  personId?: string | null;
  propertyId?: string | null;
}

const empty: DealResolution = { status: "none", dealId: null, said: null, candidates: [] };

export function dealLabel(c: DealCandidate): string {
  return String(c.title ?? "").trim() || "negócio";
}

const STOP = new Set([
  "de", "da", "do", "das", "dos", "com", "em", "no", "na", "para", "the",
  "venda", "compra", "negocio", "arrendamento", "angariacao", "sem", "pessoa",
]);

/** Palavras de identidade do título (nomes, moradas, zonas). */
export function identityWords(raw: unknown): string[] {
  return foldText(String(raw ?? ""))
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

type Quality = "igual" | "provavel" | "diferente";

export function titleMatchQuality(text: string, title: unknown): Quality {
  const words = identityWords(title);
  if (!words.length) return "diferente";
  const haystack = ` ${foldText(text)} `;
  const hits = words.filter((w) => haystack.includes(w)).length;
  if (hits === words.length) return "igual";
  if (hits >= 1 && words.length >= 2) return "provavel";
  return "diferente";
}

export async function resolveDealForWrite(
  ctx: ResolveDealCtx,
  text: string,
): Promise<DealResolution> {
  const said = String(text ?? "").trim() || null;

  const { data } = await ctx.supabase
    .from("opportunities")
    .select("id, title, stage, status, person_id, property_id, archived_at")
    .eq("user_id", ctx.userId)
    .order("updated_at", { ascending: false })
    .limit(200);
  const rows = (((data as any[]) ?? []) as DealCandidate[]).filter((r) => r?.id && isDealActive(r));
  if (!rows.length) return { ...empty, said };

  // 1) Negócio em foco na conversa.
  if (ctx.focusDealId) {
    const hit = rows.find((r) => r.id === ctx.focusDealId);
    if (hit) return { status: "linked", dealId: hit.id, said, candidates: [] };
  }

  // 2) Pessoa/imóvel mencionados neste turno.
  const byEntity = rows.filter(
    (r) =>
      (ctx.personId && r.person_id === ctx.personId) ||
      (ctx.propertyId && r.property_id === ctx.propertyId),
  );
  if (byEntity.length === 1) return { status: "linked", dealId: byEntity[0]!.id, said, candidates: [] };
  if (byEntity.length > 1) return { status: "choose", dealId: null, said, candidates: byEntity.slice(0, 4) };

  // 3) Título por palavras de identidade.
  const iguais: DealCandidate[] = [];
  const provaveis: DealCandidate[] = [];
  const source = String(text ?? "");
  if (source.trim().length >= 3) {
    for (const r of rows) {
      const q = titleMatchQuality(source, r.title);
      if (q === "igual") iguais.push(r);
      else if (q === "provavel") provaveis.push(r);
    }
  }
  if (iguais.length === 1) return { status: "linked", dealId: iguais[0]!.id, said, candidates: [] };
  if (iguais.length > 1) return { status: "choose", dealId: null, said, candidates: iguais.slice(0, 4) };
  if (provaveis.length === 1) return { status: "confirm_partial", dealId: null, said, candidates: provaveis.slice(0, 1) };
  if (provaveis.length > 1) return { status: "choose", dealId: null, said, candidates: provaveis.slice(0, 4) };

  // Nada no texto: com um único negócio ativo ligamos e nomeamos na resposta;
  // com vários, nunca às cegas — mostramos as opções.
  if (rows.length === 1) return { status: "linked", dealId: rows[0]!.id, said, candidates: [] };
  return { status: "choose", dealId: null, said, candidates: rows.slice(0, 4) };
}

/** Pergunta em PT-PT, curta e com uma decisão só. */
export function dealResolutionQuestion(res: DealResolution): string {
  if (res.status === "confirm_partial") {
    return `É do negócio "${dealLabel(res.candidates[0]!)}"? Confirma que eu registo o prazo.`;
  }
  if (res.status === "choose") {
    const lista = res.candidates.map((c, i) => `${i + 1}) ${dealLabel(c)}`).join("; ");
    return `A que negócio pertence esse prazo? ${lista}`;
  }
  if (res.status === "none") {
    return "Ainda não tenho nenhum negócio em curso onde encaixar esse prazo. Queres que crie um?";
  }
  return "";
}

export function matchDealChoice(
  text: string,
  candidates: DealCandidate[],
): { kind: "candidate"; id: string; label: string } | { kind: "skip" } | { kind: "unknown" } {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t) return { kind: "unknown" };
  if (/\b(nenhum|nenhuma|nao e|não é|outro negocio|outro negócio|sem negocio|sem negócio|deixa)\b/.test(t)) {
    return { kind: "skip" };
  }
  const num = t.match(/^\s*(\d)\s*[).]?\s*$/);
  if (num) {
    const c = candidates[Number(num[1]) - 1];
    if (c) return { kind: "candidate", id: c.id, label: dealLabel(c) };
  }
  for (const c of candidates) {
    const lbl = dealLabel(c).toLowerCase();
    if (lbl && (t.includes(lbl) || titleMatchQuality(t, c.title) === "igual")) {
      return { kind: "candidate", id: c.id, label: dealLabel(c) };
    }
  }
  return { kind: "unknown" };
}
