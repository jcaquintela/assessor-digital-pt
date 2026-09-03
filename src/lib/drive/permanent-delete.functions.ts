import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Eliminação permanente de um ficheiro do Drive (só na WebApp, só arquivados). */
export const permanentlyDeleteDriveFileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; reason: string }) => {
    if (!data?.id) throw new Error("Falta o ficheiro a eliminar.");
    return { id: String(data.id), reason: String(data.reason ?? "") };
  })
  .handler(async ({ context, data }) => {
    const { permanentlyDeleteDriveFile } = await import("./purge.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return permanentlyDeleteDriveFile(
      context.supabase,
      { userId: context.userId, fileId: data.id, reason: data.reason },
      { auditClient: supabaseAdmin },
    );
  });
