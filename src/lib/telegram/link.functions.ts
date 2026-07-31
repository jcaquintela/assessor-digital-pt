import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const TELEGRAM_TOKEN_TTL_MIN = 15;

// Estado do canal Telegram do consultor autenticado.
export const getTelegramLink = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("channel_links")
      .select("external_id, display_name, linked_at")
      .eq("channel", "telegram")
      .eq("user_id", context.userId)
      .maybeSingle();
    const row = data as { external_id: string; display_name: string | null; linked_at: string } | null;
    return {
      linked: !!row,
      displayName: row?.display_name ?? null,
      linkedAt: row?.linked_at ?? null,
    };
  });

// Gera um token de uso único e devolve o deep link do bot.
export const createTelegramLinkToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { randomBytes } = await import("crypto");
    const { TELEGRAM_BOT_USERNAME } = await import("./pairing.server");

    // Invalida tokens anteriores por usar.
    await supabaseAdmin
      .from("telegram_link_tokens")
      .update({ used_at: new Date().toISOString() } as never)
      .eq("user_id", context.userId)
      .is("used_at", null);

    const token = `tg_${randomBytes(16).toString("hex")}`;
    const expiresAt = new Date(Date.now() + TELEGRAM_TOKEN_TTL_MIN * 60_000).toISOString();
    const { error } = await supabaseAdmin
      .from("telegram_link_tokens")
      .insert({ token, user_id: context.userId, expires_at: expiresAt } as never);
    if (error) throw new Error(error.message);

    return {
      url: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${token}`,
      expiresAt,
    };
  });

// Desliga o Telegram desta conta (o chat volta a passar pelo emparelhamento).
export const unlinkTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("channel_links")
      .delete()
      .eq("channel", "telegram")
      .eq("user_id", context.userId);
    const { recomputePrimaryChannel } = await import("@/lib/assessor/primary-channel.server");
    await recomputePrimaryChannel(supabaseAdmin, context.userId);
    return { ok: true };
  });