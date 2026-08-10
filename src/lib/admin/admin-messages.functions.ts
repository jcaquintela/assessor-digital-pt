import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getConsultantMessages = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ consultorId: z.string().uuid() }).parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdmin } = await import("./suggestions-actions.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listAdminMessages, getSessionWindow } = await import("./admin-messages.server");
    const [mensagens, janela] = await Promise.all([
      listAdminMessages(supabaseAdmin, data.consultorId),
      getSessionWindow(supabaseAdmin, data.consultorId),
    ]);
    return {
      mensagens,
      janela: {
        aberta: janela.aberta,
        horasSemContacto: janela.horas,
        temWhatsApp: !!janela.telefone,
      },
    };
  });

export const sendConsultantQuestion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        consultorId: z.string().uuid(),
        pergunta: z.string().trim().min(3).max(900),
      })
      .parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdmin } = await import("./suggestions-actions.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendAdminQuestion } = await import("./admin-messages.server");
    return sendAdminQuestion(supabaseAdmin, context.userId, data);
  });

export const markConsultantRepliesRead = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ consultorId: z.string().uuid() }).parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdmin } = await import("./suggestions-actions.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { markAdminRepliesRead } = await import("./admin-messages.server");
    await markAdminRepliesRead(supabaseAdmin, data.consultorId);
    return { ok: true as const };
  });

/** Respostas novas por ler (badge em Utilizadores & planos). */
export const countUnreadConsultantReplies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import("./suggestions-actions.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { countUnreadAdminReplies } = await import("./admin-messages.server");
    return countUnreadAdminReplies(supabaseAdmin);
  });