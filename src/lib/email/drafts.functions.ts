// Ações do consultor sobre rascunhos de email, a partir do dashboard.
// O cancelamento é um estado terminal: bloqueia qualquer confirmação futura
// e fica registado na auditoria.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const cancelEmailDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ draftId: z.string().uuid(), reason: z.string().max(500).optional() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { cancelDraft } = await import("./reply-draft.server");
    return cancelDraft({
      userId: context.userId,
      draftId: data.draftId,
      source: "dashboard",
      reason: data.reason ?? null,
    });
  });
