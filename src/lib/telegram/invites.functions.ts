import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("super_admin") && !roles.includes("support_admin")) {
    throw new Error("Forbidden: admin only");
  }
}

function randomCode(): string {
  const alph = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = (n: number) => Array.from({ length: n }, () => alph[Math.floor(Math.random() * alph.length)]).join("");
  return `${pick(4)}-${pick(4)}`;
}

export const listTelegramInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("telegram_invites")
      .select("code, subscription_tier, note, expires_at, used_by, used_at, used_chat_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { invites: data ?? [] };
  });

export const createTelegramInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { note?: string; subscriptionTier?: "base" | "consultor" | "pro" | "hub"; ttlDays?: number }) =>
    z
      .object({
        note: z.string().max(200).optional(),
        subscriptionTier: z.enum(["base", "consultor", "pro", "hub"]).optional(),
        ttlDays: z.number().int().min(1).max(365).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ttl = data.ttlDays ?? 30;
    const expiresAt = new Date(Date.now() + ttl * 864e5).toISOString();
    // Retry até 3× para colisão improvável de código.
    for (let i = 0; i < 3; i++) {
      const code = randomCode();
      const { data: inserted, error } = await supabaseAdmin
        .from("telegram_invites")
        .insert({
          code,
          created_by: context.userId,
          subscription_tier: data.subscriptionTier ?? "base",
          note: data.note ?? null,
          expires_at: expiresAt,
        })
        .select("code")
        .single();
      if (!error && inserted) return { code: inserted.code };
      if (error && !String(error.code).includes("23505")) throw new Error(error.message);
    }
    throw new Error("Não consegui gerar um código único. Tenta de novo.");
  });

export const revokeTelegramInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => z.object({ code: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("telegram_invites").delete().eq("code", data.code).is("used_by", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
