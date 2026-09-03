import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PermanentDeleteType } from "./permanent-delete";

export const permanentlyDeleteRecordFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { type: PermanentDeleteType; id: string; reason: string }) => {
    if (data?.type !== "follow_up" && data?.type !== "miscellaneous") {
      throw new Error("Tipo de registo não suportado.");
    }
    if (!data?.id) throw new Error("Falta o registo a eliminar.");
    return { type: data.type, id: String(data.id), reason: String(data.reason ?? "") };
  })
  .handler(async ({ context, data }) => {
    const { permanentlyDeleteRecord } = await import("./permanent-delete.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return permanentlyDeleteRecord(
      context.supabase,
      { userId: context.userId, type: data.type, id: data.id, reason: data.reason },
      { auditClient: supabaseAdmin },
    );
  });
