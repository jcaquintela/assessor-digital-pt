// Passo opcional depois da primeira entrada por link mágico: definir uma
// palavra-passe para entrar diretamente no futuro. Saltar nunca bloqueia nada.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Deve mostrar-se o passo? Só a quem ainda não definiu palavra-passe nem
// disse "agora não".
export const getPasswordSetupState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("email, password_set_at, password_prompt_skipped_at")
      .eq("id", context.userId)
      .maybeSingle();

    const hasPassword = !!data?.password_set_at;
    const skipped = !!data?.password_prompt_skipped_at;
    return {
      email: (data?.email as string | null) ?? null,
      hasPassword,
      shouldOffer: !hasPassword && !skipped,
    };
  });

export const skipPasswordSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // O próprio consultor não tem escrita directa no perfil: o registo do
    // passo opcional é feito do lado do servidor, já com o utilizador validado.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("profiles")
      .update({ password_prompt_skipped_at: new Date().toISOString() })
      .eq("id", context.userId);
    return { ok: true as const };
  });

const schema = z.object({ password: z.string().min(8).max(200) });

export const setDashboardPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.password,
    });
    if (error) return { ok: false as const, message: error.message };

    await supabaseAdmin
      .from("profiles")
      .update({
        password_set_at: new Date().toISOString(),
        password_prompt_skipped_at: null,
      })
      .eq("id", context.userId);

    return { ok: true as const };
  });