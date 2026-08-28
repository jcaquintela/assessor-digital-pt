// Resolução obrigatória de imóvel antes de escrever.
//
// Mesmo molde de `resolvePersonForWrite`: quem escreve nunca decide sozinho.
// O antigo `resolvePropertyFromText` comparava substrings cruas ("Boavista
// 120" colava à "Boavista 12" da base de dados, sem perguntar). Aqui a
// comparação é por palavras de identidade + número de porta
// (`addressMatchQuality`) e há grau de confiança:
//
//   linked          → morada igual, candidato único: ligamos
//   confirm_partial → morada provável (nº ausente/diferente): perguntamos
//   choose          → vários candidatos plausíveis: mostramos opções
//   none            → nada a ligar
//
// Regra de ouro: "provável" nunca liga em silêncio.

import { addressMatchQuality, type AddressMatch } from "./address-match";

export interface PropertyCandidate {
  id: string;
  title?: string | null;
  address?: string | null;
  location?: string | null;
  city?: string | null;
}

export type PropertyResolutionStatus = "none" | "linked" | "confirm_partial" | "choose";

export interface PropertyResolution {
  status: PropertyResolutionStatus;
  propertyId: string | null;
  /** O que foi dito ("Boavista 120"), para a pergunta ficar natural. */
  said: string | null;
  candidates: PropertyCandidate[];
}

interface ResolveCtx {
  supabase: any;
  userId: string;
  sourceMessageId?: string | null;
}

export function propertyLabel(c: PropertyCandidate): string {
  return String(c.address || c.title || c.location || "imóvel").trim();
}

const empty: PropertyResolution = { status: "none", propertyId: null, said: null, candidates: [] };

/**
 * Qualidade da melhor correspondência entre a frase e um imóvel.
 * A frase inteira entra como um dos lados: `addressMatchQuality` exige que as
 * palavras de identidade do lado mais curto (o imóvel) estejam todas presentes.
 */
function bestQuality(text: string, c: PropertyCandidate): AddressMatch {
  let best: AddressMatch = "diferente";
  for (const raw of [c.address, c.title, c.location]) {
    const q = addressMatchQuality(text, raw);
    if (q === "igual") return "igual";
    if (q === "provavel") best = "provavel";
  }
  return best;
}

export async function resolvePropertyForWrite(
  ctx: ResolveCtx,
  text: string,
  opts?: { includeSourceMessage?: boolean },
): Promise<PropertyResolution> {
  let source = String(text ?? "").trim();
  // O título gravado pode perder a morada ("Visita com Sr. Almeida"); nesse
  // caso olhamos também para a frase original do consultor.
  if (opts?.includeSourceMessage !== false && ctx.sourceMessageId) {
    try {
      const { data: msg } = await ctx.supabase
        .from("assessor_messages")
        .select("content")
        .eq("id", ctx.sourceMessageId)
        .eq("user_id", ctx.userId)
        .maybeSingle();
      const extra = (msg as { content?: string } | null)?.content;
      if (extra) source = `${source} ${extra}`.trim();
    } catch { /* sem frase original, seguimos com o que temos */ }
  }
  if (source.length < 4) return empty;

  const { data } = await ctx.supabase
    .from("properties")
    .select("id, title, address, location, city")
    .eq("user_id", ctx.userId)
    .limit(300);
  const rows = ((data as any[]) ?? []) as PropertyCandidate[];
  if (!rows.length) return empty;

  const iguais: PropertyCandidate[] = [];
  const provaveis: PropertyCandidate[] = [];
  for (const r of rows) {
    if (!r?.id) continue;
    const q = bestQuality(source, r);
    if (q === "igual") iguais.push(r);
    else if (q === "provavel") provaveis.push(r);
  }

  const said = String(text ?? "").trim() || null;
  if (iguais.length === 1) {
    return { status: "linked", propertyId: String(iguais[0]!.id), said, candidates: [] };
  }
  if (iguais.length > 1) {
    return { status: "choose", propertyId: null, said, candidates: iguais.slice(0, 4) };
  }
  if (provaveis.length === 1) {
    return { status: "confirm_partial", propertyId: null, said, candidates: provaveis.slice(0, 1) };
  }
  if (provaveis.length > 1) {
    return { status: "choose", propertyId: null, said, candidates: provaveis.slice(0, 4) };
  }
  return empty;
}

/** Pergunta em PT-PT, curta e com uma decisão só. */
export function propertyResolutionQuestion(res: PropertyResolution): string {
  if (res.status === "confirm_partial") {
    return `É o imóvel ${propertyLabel(res.candidates[0]!)}? Se não for, diz-me qual é ou avanço sem associar.`;
  }
  if (res.status === "choose") {
    const lista = res.candidates.map((c, i) => `${i + 1}) ${propertyLabel(c)}`).join("; ");
    return `Tenho mais do que um imóvel parecido: ${lista}. Qual deles é?`;
  }
  return "";
}

/** Escolha do consultor sobre o imóvel proposto: índice, morada ou recusa. */
export function matchPropertyChoice(
  text: string,
  candidates: PropertyCandidate[],
): { kind: "candidate"; id: string; label: string } | { kind: "skip" } | { kind: "unknown" } {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t) return { kind: "unknown" };
  if (/\b(nenhum|nenhuma|nao e|não é|outro imovel|outro imóvel|sem imovel|sem imóvel|avanca sem|avança sem)\b/.test(t)) {
    return { kind: "skip" };
  }
  const num = t.match(/^\s*(\d)\s*[).]?\s*$/);
  if (num) {
    const i = Number(num[1]) - 1;
    const c = candidates[i];
    if (c) return { kind: "candidate", id: String(c.id), label: propertyLabel(c) };
  }
  for (const c of candidates) {
    const lbl = propertyLabel(c).toLowerCase();
    if (lbl && (t.includes(lbl) || lbl.includes(t))) {
      return { kind: "candidate", id: String(c.id), label: propertyLabel(c) };
    }
  }
  return { kind: "unknown" };
}
