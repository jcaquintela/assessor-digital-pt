// Follow-up pós-visita — parte com BD e IA.
//
// Composição de peças já existentes: buildPersonBrief (já filtrado de notas
// confidenciais quando é para texto que sai), composeOutboundBody (gerador
// PT-PT) e search_similar_listings (comparáveis com guardrails). Só corre
// DEPOIS do consultor confirmar a proposta do áudio.

import type { DomainContext } from "../v2/domain.server";
import type { AudioTheme } from "./audio-themes";
import { visitDraftInstructions } from "./visit-followup";

export interface VisitFollowUpOutput {
  draft: string | null;
  comparables: string | null;
}

/** Rascunho curto pós-visita. Mesmo gerador do email, outro registo de escrita. */
export async function composeVisitFollowUp(args: {
  toName: string;
  contextLines: string[];
  instructions: string;
  consultantName?: string | null;
}): Promise<string | null> {
  try {
    const { composeOutboundBody } = await import("@/lib/email/outbound-draft.server");
    const body = await composeOutboundBody({
      toName: args.toName,
      contextLines: args.contextLines,
      instructions: args.instructions,
      consultantName: args.consultantName ?? null,
      style: "short_message",
    });
    return String(body ?? "").trim() || null;
  } catch {
    // Falhar a escrever o rascunho nunca pode estragar o registo da visita.
    return null;
  }
}

/** Contexto da ficha + rascunho + comparáveis, prontos para as bolhas. */
export async function buildVisitFollowUp(
  ctx: DomainContext,
  theme: AudioTheme,
  opts: { personId: string | null; personName: string | null; propertyId: string | null },
): Promise<VisitFollowUpOutput> {
  const name = String(opts.personName ?? theme.person?.name ?? "").trim();
  let contextLines: string[] = [];
  if (name || opts.personId) {
    try {
      const { buildPersonBrief } = await import("./person-brief.server");
      const { briefContextLines } = await import("@/lib/email/outbound-draft.server");
      // `outward: true` — nada de confidencial pode entrar num texto que o
      // consultor vai enviar ao próprio cliente.
      const look = await buildPersonBrief(ctx, name, { outward: true, personId: opts.personId });
      if (look.kind === "ok") contextLines = briefContextLines(look.brief);
    } catch { /* sem ficha, escreve-se só com o que veio do áudio */ }
  }

  let consultantName: string | null = null;
  try {
    const { data: prof } = await ctx.supabase
      .from("profiles").select("name").eq("id", ctx.userId).maybeSingle();
    consultantName = (prof as any)?.name ?? null;
  } catch { /* sem nome, a mensagem sai na mesma */ }

  const draft = name
    ? await composeVisitFollowUp({
        toName: name,
        contextLines,
        instructions: visitDraftInstructions(theme),
        consultantName,
      })
    : null;


  let comparables: string | null = null;
  const zone = String(theme.visit?.comparison_zone ?? "").trim();
  if (zone.length >= 2) {
    try {
      const { execSearchSimilarListings } = await import("@/lib/imoveis/similar-listings.server");
      const { formatSimilarListings } = await import("@/lib/imoveis/similar-listings");
      const res = await execSearchSimilarListings(ctx as any, {
        property_id: opts.propertyId,
        location: zone,
        typology: theme.property?.typology ?? null,
      });
      if (res.ok && res.data && !(res.data as any).needs_field && !(res.data as any).rate_limited) {
        const text = formatSimilarListings(res.data as any).trim();
        if (text && (res.data as any).results?.length) comparables = text;
      }
    } catch { /* comparáveis são bónus, nunca travam a resposta */ }
  }

  return { draft, comparables };
}
