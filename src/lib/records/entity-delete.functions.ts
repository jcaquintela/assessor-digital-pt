import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EntityDeleteType } from "./entity-delete";

const TYPES: EntityDeleteType[] = ["person", "property", "opportunity"];

function validaTipo(t: unknown): EntityDeleteType {
  if (!TYPES.includes(t as EntityDeleteType)) throw new Error("Tipo de registo não suportado.");
  return t as EntityDeleteType;
}

/** Diagnóstico usado pela UI antes sequer de mostrar a opção de eliminar. */
export const assessEntityDeletionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { type: EntityDeleteType; id: string }) => {
    if (!data?.id) throw new Error("Falta o registo.");
    return { type: validaTipo(data?.type), id: String(data.id) };
  })
  .handler(async ({ context, data }) => {
    const { assessEntityDeletion } = await import("./entity-delete.server");
    return assessEntityDeletion(context.supabase, {
      userId: context.userId,
      type: data.type,
      id: data.id,
    });
  });

export const permanentlyDeleteEntityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { type: EntityDeleteType; id: string; reason: string }) => {
    if (!data?.id) throw new Error("Falta o registo a eliminar.");
    return {
      type: validaTipo(data?.type),
      id: String(data.id),
      reason: String(data?.reason ?? ""),
    };
  })
  .handler(async ({ context, data }) => {
    const { permanentlyDeleteEntity } = await import("./entity-delete.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return permanentlyDeleteEntity(
      context.supabase,
      { userId: context.userId, type: data.type, id: data.id, reason: data.reason },
      { auditClient: supabaseAdmin },
    );
  });

export const anonymizePersonFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; reason: string }) => {
    if (!data?.id) throw new Error("Falta a pessoa a anonimizar.");
    return { id: String(data.id), reason: String(data?.reason ?? "") };
  })
  .handler(async ({ context, data }) => {
    const { anonymizePerson } = await import("./entity-delete.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return anonymizePerson(
      context.supabase,
      { userId: context.userId, id: data.id, reason: data.reason },
      { auditClient: supabaseAdmin },
    );
  });
