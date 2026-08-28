// Ramos de pendente que criam entidades depois do "sim": placa de prospeção,
// pessoa a partir de frase elíptica e negócio.
//
// Extraídos linha a linha do motor v3 — comportamento idêntico.

import { TOOL_REGISTRY } from "../../v2/domain.server";
import { isConfirmation as saIsConfirmation, isRejection as saIsRejection } from "../../culture/short-answers";
import { applySafetyNet } from "../safety-net.server";
import { logAiTurn } from "../telemetry-repo.server";
import { PendingRepo } from "./pending-repo.server";
import type { PendingResolver } from "./types";

/** create_prospecting_lead — placa registada só depois de confirmação. */
export const createProspectingLeadPending: PendingResolver = async ({ ctx, supabase, userId, channel, trimmed, pending }) => {
  if (!pending || pending.intent !== "create_prospecting_lead") return null;
  if (saIsConfirmation(trimmed)) {
    const exec = TOOL_REGISTRY.create_prospecting_lead;
    const t0 = Date.now();
    const result = await exec(ctx, pending.structured_payload ?? {});
    const okOk = !!result.ok && !(result.data as any)?.duplicate;
    const leadId = (result.data as any)?.lead?.id ?? (result.data as any)?.existing?.id ?? null;
    await PendingRepo.markStatus(supabase, pending.id, okOk ? "executed" : "failed", {
      created_resource_type: okOk ? "prospecting_lead" : null,
      created_resource_id: okOk ? leadId : null,
      error_message: okOk ? null : (result.error ?? "not_created"),
    });
    if (okOk && leadId) {
      await PendingRepo.rememberLastEntity(supabase, {
        userId, channel,
        entityType: "prospecting_lead",
        entityId: leadId,
        intent: "create_prospecting_lead",
      });
      // Materializa também como Imóvel para aparecer na área /imoveis
      // com o estado "por_angariar" (oportunidade a captar). O consultor
      // pode enriquecer depois. Falhas aqui não bloqueiam a resposta.
      try {
        const payload: any = pending.structured_payload ?? {};
        const composedTitle = String(
          payload.title ??
            [payload.property_type ?? "Imóvel", payload.address_hint, payload.location]
              .filter(Boolean).join(" · "),
        ).trim().slice(0, 200) || "Imóvel de prospeção";
        const { data: propRow } = await supabase
          .from("properties")
          .insert({
            user_id: userId,
            title: composedTitle,
            property_type: payload.property_type ?? null,
            typology: payload.typology ?? null,
            location: payload.location ?? null,
            address: payload.address_hint ?? null,
            status: "por_angariar",
            notes: payload.notes ?? null,
            source_channel: channel,
          } as never)
          .select("id")
          .maybeSingle();
        const propertyId = (propRow as any)?.id ?? null;
        if (propertyId) {
          await supabase
            .from("prospecting_leads")
            .update({ related_property_id: propertyId } as never)
            .eq("id", leadId)
            .eq("user_id", userId);
        }
      } catch { /* noop */ }
    }
    const dupLead = (result.data as any)?.duplicate === true;
    const baseReply = okOk
      ? "Feito. Registei a placa para contactares. Queres que te lembre de ligar?"
      : (dupLead
          ? "Já tinhas uma placa registada com esse número. Fica na mesma."
          : "Tentei mas não consegui guardar a placa. Podes tentar outra vez?");
    // Rede de segurança: placa confirmada que não chegou a ser criada
    // fica em Diversos > Por tratar (antes desaparecia sem rasto).
    let reply = await applySafetyNet(ctx, {
      content: pending.original_content || trimmed,
      outcome: okOk ? "executed_ok" : (dupLead ? "duplicate" : "tool_failed"),
      reason: result.error ?? "not_created",
      reply: baseReply,
    });
    // Placa de particular: além do lembrete, oferecemos preparar um
    // guião. Continua a ser sempre rascunho para o consultor rever.
    if (okOk) {
      const { appendScriptOffer } = await import("@/lib/prospecting/script-offer.server");
      reply = await appendScriptOffer(
        { supabase, userId, channel },
        {
          reply,
          leadId,
          payload: (pending.structured_payload ?? {}) as Record<string, any>,
          originalContent: pending.original_content || trimmed,
        },
      );
    }
    await logAiTurn(supabase, {
      userId, channel, intent: "prospecting_confirm_fast_path", route: "v3",
      latencyMs: Date.now() - t0, success: okOk, error: okOk ? null : (result.error ?? "not_created"),
      toolName: "create_prospecting_lead", toolSuccess: okOk, fallbackUsed: false,
    });
    return { reply };
  }
  if (saIsRejection(trimmed)) {
    await PendingRepo.markStatus(supabase, pending.id, "cancelled");
    return { reply: "Está bem, não registei nada." };
  }
  return null;
};

/**
 * create_person_elliptic — frase elíptica confirmada ("Seguimento à lead
 * Maria Manuela 912..."). Só aqui é que se escreve.
 */
export const createPersonEllipticPending: PendingResolver = async ({ ctx, supabase, trimmed, pending }) => {
  if (!pending || pending.intent !== "create_person_elliptic") return null;
  if (saIsConfirmation(trimmed)) {
    const payload = (pending.structured_payload ?? {}) as Record<string, any>;
    const name = String(payload.name ?? "").trim();
    const created = await TOOL_REGISTRY.create_person(ctx, {
      name,
      phone: payload.phone ?? null,
      relationship_type: "potencial_cliente",
      summary: String(pending.original_content ?? "").slice(0, 300) || null,
    });
    const personId = (created.data as any)?.person?.id ?? (created.data as any)?.id ?? null;
    let followUpOk = false;
    if (created.ok && payload.with_follow_up) {
      const due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const fu = await TOOL_REGISTRY.create_follow_up(ctx, {
        title: `Seguimento a ${name}`,
        type: "tarefa",
        due_date: due,
        priority: "media",
        person_id: personId,
      });
      followUpOk = !!fu.ok;
    }
    await PendingRepo.markStatus(supabase, pending.id, created.ok ? "executed" : "failed", {
      created_resource_type: created.ok ? "person" : null,
      created_resource_id: created.ok ? personId : null,
      error_message: created.ok ? null : (created.error ?? "not_created"),
    });
    const baseReply = created.ok
      ? (followUpOk
          ? `Feito. Registei a ${name} e deixei um seguimento para amanhã.`
          : `Feito. Registei a ${name}.`)
      : "Tentei registar e não consegui. Podes repetir o nome e o número?";
    const reply = await applySafetyNet(ctx, {
      content: pending.original_content || trimmed,
      outcome: created.ok ? "executed_ok" : "tool_failed",
      reason: created.error ?? "not_created",
      reply: baseReply,
    });
    return { reply };
  }
  if (saIsRejection(trimmed)) {
    await PendingRepo.markStatus(supabase, pending.id, "cancelled");
    return { reply: "Está bem, não registei nada." };
  }
  return null;
};

/** create_deal — negócio proposto pelo Afonso, criado só depois do "sim". */
export const createDealPending: PendingResolver = async ({ ctx, supabase, userId, channel, trimmed, pending }) => {
  if (!pending || pending.intent !== "create_deal") return null;
  if (saIsConfirmation(trimmed)) {
    const exec = TOOL_REGISTRY.create_deal;
    const result = await exec(ctx, pending.structured_payload ?? {});
    const data = (result.data as any) ?? {};
    const okOk = !!result.ok;
    await PendingRepo.markStatus(supabase, pending.id, okOk ? "executed" : "failed", {
      created_resource_type: okOk ? "opportunity" : null,
      created_resource_id: okOk ? (data.id ?? null) : null,
      error_message: okOk ? null : (result.error ?? "not_created"),
    });
    if (okOk && data.id) {
      await PendingRepo.rememberLastEntity(supabase, {
        userId, channel,
        entityType: "opportunity",
        entityId: data.id,
        intent: "create_deal",
      });
    }
    if (!okOk) {
      return { reply: `Não consegui criar o negócio: ${result.error ?? "tenta outra vez"}.` };
    }
    const extra = data.linkedMovements > 0
      ? ` Liguei ${data.linkedMovements === 1 ? "a comissão que já tinhas registada" : `${data.linkedMovements} movimentos financeiros`}.`
      : "";
    return {
      reply: data.duplicate
        ? `Já tinhas esse negócio aberto — "${data.title}". Não criei outro.${extra}`
        : `Feito. Abri o negócio "${data.title}", em "A começar".${extra}`,
    };
  }
  if (saIsRejection(trimmed)) {
    await PendingRepo.markStatus(supabase, pending.id, "cancelled");
    return { reply: "Está bem, não abri negócio nenhum." };
  }
  return null;
};
