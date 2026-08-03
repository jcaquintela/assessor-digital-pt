// Regras mínimas do Negócio. Puro — importável no cliente, no servidor e nos
// testes. Um negócio é o fio condutor de um processo comercial real: sem
// pessoa (ou imóvel) e sem objetivo, é só uma linha vazia no quadro.

import { normalizeKind, type DealKind } from "./stages";

export interface DealMinimumInput {
  title?: string | null;
  kind?: string | null;
  personId?: string | null;
  propertyId?: string | null;
}

export type DealMinimumResult =
  | { ok: true; title: string; kind: DealKind }
  | { ok: false; error: string };

function cleanDealTitle(raw: unknown): string {
  const t = String(raw ?? "").trim().replace(/\s+/g, " ");
  // Pontuação isolada ("?", "-", "…") não é objetivo nenhum.
  if (!t || !/[\p{L}\p{N}]/u.test(t)) return "";
  return t.slice(0, 200);
}

/**
 * Regra mínima: pessoa (ou imóvel) + objetivo.
 * O objetivo é o título; quando falta, um tipo explícito diferente de "outro"
 * chega para o construir a partir do contexto.
 */
export function validateDealMinimum(
  input: DealMinimumInput,
  context?: { personName?: string | null; propertyTitle?: string | null },
): DealMinimumResult {
  const person = (input.personId ?? "").trim();
  const property = (input.propertyId ?? "").trim();
  if (!person && !property) {
    return { ok: false, error: "Um negócio precisa de uma pessoa (ou de um imóvel). Diz-me de quem é." };
  }

  const kind = normalizeKind(input.kind);
  let title = cleanDealTitle(input.title);
  if (!title) {
    if (kind === "outro") {
      return { ok: false, error: "Falta o objetivo do negócio. É uma venda, uma angariação, um arrendamento?" };
    }
    const who = context?.propertyTitle?.trim() || context?.personName?.trim() || "";
    const label = kind.charAt(0).toUpperCase() + kind.slice(1);
    title = who ? `${label} · ${who}` : label;
  }
  return { ok: true, title, kind };
}

/** Duas descrições referem-se ao mesmo assunto? Usado no dedupe brando. */
export function sameDealScope(
  a: { personId?: string | null; propertyId?: string | null; kind?: string | null },
  b: { personId?: string | null; propertyId?: string | null; kind?: string | null },
): boolean {
  const ap = (a.propertyId ?? "") || null;
  const bp = (b.propertyId ?? "") || null;
  if (ap && bp) return ap === bp;
  const aper = (a.personId ?? "") || null;
  const bper = (b.personId ?? "") || null;
  if (aper && bper && aper === bper) {
    // Sem imóvel comum, só é o mesmo negócio se o objetivo for o mesmo.
    if (ap && bp) return false;
    return normalizeKind(a.kind) === normalizeKind(b.kind);
  }
  return false;
}
