// Resolução obrigatória de pessoa antes de escrever um seguimento.
//
// Caso real (14/08): "Marca visita com o Manuel amanhã" gravou o compromisso
// com o nome preso em texto livre e `person_id: null`. No dia seguinte, pedir
// o contacto do Manuel devolvia "Manuela" e "Maria Manuela".
// Regra: quem escreve nunca decide sozinho — ou liga com certeza (telefone
// inequívoco), ou pergunta. Silêncio nunca é resposta.

import { foldText } from "@/lib/search/normalize";
import { classifyPeopleMatches, describeCandidates, joinOr, nameMatchQuality, personLabel, personNameFromEventText } from "./name-match";
import { classifyPhoneInput } from "./phone-input";

export interface PersonCandidate {
  id: string;
  name: string;
  phone?: string | null;
  relationship_type?: string | null;
}

export type PersonResolutionStatus =
  /** Nenhum nome mencionado — nada a resolver. */
  | "none"
  /** Telefone inequívoco: ligamos e informamos quem ficou associado. */
  | "linked"
  /** Nome completo idêntico, candidato único: confirmação leve. */
  | "confirm_exact"
  /** Vários candidatos plausíveis: mostrar opções. */
  | "choose"
  /** Correspondência parcial ("Manuel" → "Manuel Silva"): perguntar. */
  | "confirm_partial"
  /** Ninguém com esse nome: perguntar se é pessoa nova. */
  | "new";

export interface PersonResolution {
  status: PersonResolutionStatus;
  personId: string | null;
  name: string | null;
  candidates: PersonCandidate[];
}

interface ResolveCtx {
  supabase: any;
  userId: string;
  channel?: string;
}

/** Primeiro número de telefone plausível escrito na frase. */
export function phoneFromText(text: string | null | undefined): string | null {
  const matches = String(text ?? "").match(/(\+?\d[\d\s.\-/()]{7,20}\d)/g) ?? [];
  for (const m of matches) {
    const c = classifyPhoneInput(m);
    if (c.valid && c.e164) return c.e164;
  }
  return null;
}

/** Pessoas rejeitadas pelo consultor nas últimas horas — não voltam a ser propostas. */
export async function recentlyRejectedPersonIds(ctx: ResolveCtx): Promise<string[]> {
  try {
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data } = await ctx.supabase
      .from("pending_actions")
      .select("structured_payload, updated_at")
      .eq("user_id", ctx.userId)
      .eq("intent", "confirm_event_person")
      .eq("status", "cancelled")
      .gte("updated_at", since)
      .limit(10);
    const ids = new Set<string>();
    for (const row of ((data as any[]) ?? [])) {
      for (const id of (row?.structured_payload?.rejected_person_ids ?? [])) {
        if (typeof id === "string") ids.add(id);
      }
    }
    return [...ids];
  } catch {
    return [];
  }
}

/**
 * Resolução completa: telefone → nome exacto → parcial → parecido → novo.
 * Toda a pesquisa é feita dentro da conta do consultor (`user_id`); pessoas
 * de outras contas nunca podem aparecer como candidatas.
 */
export async function resolvePersonForWrite(
  ctx: ResolveCtx,
  text: string,
  opts?: { excludeIds?: string[] },
): Promise<PersonResolution> {
  const empty = (status: PersonResolutionStatus, name: string | null = null): PersonResolution =>
    ({ status, personId: null, name, candidates: [] });

  const exclude = new Set(opts?.excludeIds ?? []);

  // 1) Telefone E.164 inequívoco liga automaticamente.
  const e164 = phoneFromText(text);
  if (e164) {
    const { data } = await ctx.supabase
      .from("person_phones")
      .select("person_id, people:person_id(id, name, phone, relationship_type)")
      .eq("user_id", ctx.userId)
      .eq("e164", e164)
      .limit(2);
    const rows = ((data as any[]) ?? []).filter((r) => !exclude.has(String(r?.person_id ?? "")));
    if (rows.length === 1) {
      const p = rows[0]?.people ?? {};
      return {
        status: "linked",
        personId: String(rows[0].person_id),
        name: p?.name ?? null,
        candidates: [],
      };
    }
  }

  // 2) Nome mencionado na frase.
  const name = personNameFromEventText(text);
  if (!name) return empty("none");

  const { data } = await ctx.supabase
    .from("people")
    .select("id, name, phone, relationship_type")
    .eq("user_id", ctx.userId)
    .limit(500);
  const rows = (((data as any[]) ?? []) as PersonCandidate[])
    .filter((r) => r?.id && !exclude.has(String(r.id)));

  const { exact, suggestions } = classifyPeopleMatches(name, rows as unknown as Array<{ name: string } & Record<string, unknown>>);
  const fullExact = (exact as unknown as PersonCandidate[]).filter((r) => nameMatchQuality(r.name, name) === "exact");
  const partial = (exact as unknown as PersonCandidate[]).filter((r) => nameMatchQuality(r.name, name) === "word");

  if (fullExact.length === 1 && partial.length === 0) {
    return { status: "confirm_exact", personId: fullExact[0]!.id, name, candidates: fullExact };
  }
  const plausible = [...fullExact, ...partial];
  if (plausible.length > 1) {
    return { status: "choose", personId: null, name, candidates: plausible.slice(0, 4) };
  }
  if (plausible.length === 1) {
    return { status: "confirm_partial", personId: null, name, candidates: plausible };
  }
  return {
    status: "new",
    personId: null,
    name,
    candidates: (suggestions as unknown as PersonCandidate[]).slice(0, 3),
  };
}

function label(c: PersonCandidate): string {
  return personLabel(c as any);
}

/** Pergunta em PT-PT para cada resultado da resolução. */
export function personResolutionQuestion(res: PersonResolution): string {
  const who = String(res.name ?? "").trim();
  switch (res.status) {
    case "confirm_exact":
      return `É o ${label(res.candidates[0]!)} que já tens na lista? Confirmas para eu ligar o compromisso a ele.`;
    case "choose":
      return `Tenho mais do que um ${who}: ${describeCandidates(res.candidates as any).join("; ")}. Qual deles é?`;
    case "confirm_partial":
      return `O ${who} é o ${label(res.candidates[0]!)}? Se não for, digo-me quem é ou crio um contacto novo.`;
    case "new":
      return res.candidates.length
        ? `Ainda não tenho ninguém chamado exatamente "${who}". Crio um contacto novo ou é ${joinOr(describeCandidates(res.candidates as any))}?`
        : `Ainda não tenho nenhum contacto "${who}". Crio um contacto novo com esse nome ou avanço sem associar?`;
    default:
      return "";
  }
}

/** Marca explicitamente que o compromisso ficou sem pessoa por decisão do consultor. */
export const NO_PERSON_NOTE = "Sem contacto associado (decisão do consultor).";

export function withNoPersonNote(notes: string | null | undefined): string {
  const base = String(notes ?? "").trim();
  if (foldText(base).includes(foldText(NO_PERSON_NOTE))) return base;
  return base ? `${base}\n${NO_PERSON_NOTE}` : NO_PERSON_NOTE;
}
