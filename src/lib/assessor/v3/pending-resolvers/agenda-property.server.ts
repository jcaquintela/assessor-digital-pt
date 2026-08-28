// confirm_event_property — o consultor diz qual é o imóvel.
//
// Nasceu do mesmo problema das pessoas: "Boavista 120" era colado à
// "Boavista 12" que estava na base de dados, sem perguntar. Agora, quando a
// morada só é "provável", a escrita fica em espera até haver resposta.

import { TOOL_REGISTRY } from "../../v2/domain.server";
import { isConfirmation as saIsConfirmation } from "../../culture/short-answers";
import { PendingRepo } from "./pending-repo.server";
import type { PendingResolver } from "./types";

export const confirmEventPropertyPending: PendingResolver = async ({ ctx, supabase, trimmed, pending }) => {
  if (!pending || pending.intent !== "confirm_event_property") return null;
  const payload = (pending.structured_payload ?? {}) as Record<string, any>;
  const candidates = ((payload.suggestions ?? []) as any[]).filter((c) => c?.id);
  const toolName = String(payload.tool ?? "create_event");
  const exec = (TOOL_REGISTRY as any)[toolName];
  const incoming = payload.incoming ?? null;
  if (!exec || !incoming) return null;

  const { matchPropertyChoice, propertyLabel } = await import("@/lib/imoveis/resolve-property.server");
  let choice = matchPropertyChoice(trimmed, candidates as any);
  // "Sim" a uma proposta única vale como escolha dela.
  if (choice.kind === "unknown" && saIsConfirmation(trimmed) && candidates.length === 1 && payload.mode === "confirm_partial") {
    choice = { kind: "candidate", id: String(candidates[0].id), label: propertyLabel(candidates[0]) };
  }
  if (choice.kind === "unknown") return null;

  const propertyId = choice.kind === "candidate" ? choice.id : null;
  // Categorizar sem imóvel não faz sentido: se recusa, fica por fazer.
  if (!propertyId && toolName === "set_property_category") {
    await PendingRepo.markStatus(supabase, pending.id, "cancelled", {
      error_message: "consultor não confirmou o imóvel",
    });
    return { reply: "Certo, não mexi na categoria. Diz-me qual é o imóvel quando souberes." };
  }

  const result = await exec(
    { ...ctx, skipPropertyResolution: true, skipPersonResolution: true, skipDuplicateCheck: true },
    { ...incoming, property_id: propertyId },
  );
  const createdId =
    (result.data as any)?.event?.id ?? (result.data as any)?.follow_up?.id ?? (result.data as any)?.id ?? null;
  await PendingRepo.markStatus(supabase, pending.id, result.ok ? "executed" : "failed", {
    created_resource_type: result.ok && toolName !== "set_property_category" ? "follow_up" : null,
    created_resource_id: result.ok ? createdId : null,
    error_message: result.ok ? null : (result.error ?? "not_created"),
  });
  if (!result.ok) return { reply: "Tentei guardar isso agora e não consegui. Queres que tente outra vez?" };
  if (!propertyId) return { reply: "Certo — ficou registado sem imóvel associado." };
  const what = toolName === "set_property_category" ? "Categoria alterada" : "Fica ligado";
  return { reply: `${what} ao imóvel ${choice.kind === "candidate" ? choice.label : ""}.`.replace(" .", ".") };
};
