// Oferta de guião logo a seguir ao registo de uma placa de "vende o próprio".
//
// Vive fora do motor de raciocínio para ficar contida: é um passo extra do
// fluxo placa → lead, não uma capacidade geral da conversa. A IA não escreve
// nada na base de dados a partir daqui — só criamos um rascunho pendente e,
// se o consultor escolher, devolvemos texto para ele rever.

import { createPendingAction, markPendingActionStatus, findActivePendingAction } from "@/lib/assessor/memory.server";
import {
  SCRIPT_OFFER_QUESTION,
  buildProspectingScript,
  formatScriptReply,
  isOwnerSaleLead,
  readScriptChoice,
  type ScriptLeadInfo,
} from "./script-draft";

const SCRIPT_INTENT = "offer_prospecting_script";

interface Ctx {
  supabase: any;
  userId: string;
  channel: string;
}

async function consultantName(supabase: any, userId: string): Promise<string | null> {
  try {
    const { data } = await supabase.from("profiles").select("name").eq("id", userId).maybeSingle();
    const n = String((data as any)?.name ?? "").trim();
    return n || null;
  } catch {
    return null;
  }
}

/**
 * Devolve a resposta já com a oferta do guião acrescentada, quando o lead
 * acabado de registar é de particular. Nos restantes casos devolve a resposta
 * intacta — nesta fase só testamos FSBO.
 */
export async function appendScriptOffer(
  ctx: Ctx,
  input: { reply: string; leadId: string | null; payload: Record<string, any>; originalContent?: string | null },
): Promise<string> {
  const payload = input.payload ?? {};
  if (!isOwnerSaleLead(payload.listing_type)) return input.reply;
  try {
    await createPendingAction(ctx.supabase, {
      userId: ctx.userId,
      channel: ctx.channel,
      intent: SCRIPT_INTENT,
      originalContent: String(input.originalContent ?? "").slice(0, 500),
      payload: {
        lead_id: input.leadId,
        listing_type: payload.listing_type ?? null,
        location: payload.location ?? payload.address_hint ?? null,
        property_type: payload.property_type ?? null,
        typology: payload.typology ?? null,
      },
      currentQuestion: SCRIPT_OFFER_QUESTION,
      pendingQuestion: SCRIPT_OFFER_QUESTION,
    });
  } catch {
    return input.reply; // sem rascunho pendente não vale a pena prometer o guião
  }
  return `${input.reply} ${SCRIPT_OFFER_QUESTION}`;
}

/**
 * Responde a "chamada"/"mensagem" quando existe uma oferta de guião em aberto.
 * Devolve null quando não há nada a fazer — a mensagem segue o seu caminho
 * normal (por exemplo, um "sim" ao lembrete de ligar).
 */
export async function resolveScriptPending(ctx: Ctx, text: string): Promise<string | null> {
  let pending: any = null;
  try {
    pending = await findActivePendingAction(ctx.supabase, ctx.userId, ctx.channel, "script");
  } catch {
    return null;
  }
  if (!pending || pending.intent !== SCRIPT_INTENT) return null;

  const choice = readScriptChoice(text);
  if (choice === "none") return null;
  if (choice === "refuse") {
    try { await markPendingActionStatus(ctx.supabase, pending.id, "cancelled"); } catch { /* noop */ }
    return "Certo, sem guião. A placa fica registada na mesma.";
  }

  const payload = (pending.structured_payload ?? {}) as Record<string, any>;
  const lead: ScriptLeadInfo = {
    listingType: payload.listing_type ?? null,
    location: payload.location ?? null,
    propertyType: payload.property_type ?? null,
    typology: payload.typology ?? null,
    consultantName: await consultantName(ctx.supabase, ctx.userId),
  };
  const body = buildProspectingScript(choice, lead);
  try {
    await markPendingActionStatus(ctx.supabase, pending.id, "executed", {
      created_resource_type: "prospecting_script",
      created_resource_id: payload.lead_id ?? null,
    });
  } catch { /* noop */ }
  return formatScriptReply(choice, body);
}
