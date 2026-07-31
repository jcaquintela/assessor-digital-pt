import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizePhone } from "./phone";
import { canUseWhatsApp, normalizeTier, tierLabel } from "@/lib/subscription/tiers";

export const WHATSAPP_CODE_TTL_MIN = 15;
export const WHATSAPP_CODE_MAX_ATTEMPTS = 5;
export const WHATSAPP_CODE_PATTERN = /LIGAR-\d{6}/i;

// hashLinkCode / generateLinkCode vivem em ./link-code.server.ts —
// este módulo é importado por código de cliente (definicoes.tsx) e
// node:crypto não pode ser referenciado no bundle do browser.

// Fetch and cache the display phone number (E.164 digits) from Meta Graph.
let _displayNumberCache: { value: string | null; expiresAt: number } | null = null;
export async function getDisplayNumber(): Promise<string | null> {
  const now = Date.now();
  if (_displayNumberCache && _displayNumberCache.expiresAt > now) return _displayNumberCache.value;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return null;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${phoneNumberId}?fields=display_phone_number`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const json = (await res.json().catch(() => ({}))) as { display_phone_number?: string };
    const digits = normalizePhone(json?.display_phone_number);
    _displayNumberCache = { value: digits, expiresAt: now + 60 * 60_000 };
    return digits;
  } catch {
    return null;
  }
}

const phoneSchema = z.object({
  phone: z.string().trim().min(6).max(24),
});

export const getWhatsAppLink = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: prof } = await context.supabase
      .from("profiles")
      .select("phone, phone_verified_at, whatsapp_link_status, whatsapp_linked_at")
      .eq("id", context.userId)
      .maybeSingle();

    const nowIso = new Date().toISOString();
    const { data: activeCode } = await context.supabase
      .from("whatsapp_link_codes")
      .select("id, phone, expires_at, attempts, created_at")
      .eq("user_id", context.userId)
      .is("used_at", null)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const p = prof as { phone: string | null; phone_verified_at: string | null; whatsapp_link_status: string | null; whatsapp_linked_at: string | null } | null;
    return {
      phone: p?.phone ?? null,
      status: ((p?.whatsapp_link_status ?? "unlinked") as "unlinked" | "pending" | "linked"),
      verifiedAt: p?.phone_verified_at ?? null,
      linkedAt: p?.whatsapp_linked_at ?? null,
      pendingCode: activeCode
        ? {
            phone: (activeCode as { phone: string }).phone,
            expiresAt: (activeCode as { expires_at: string }).expires_at,
            attempts: (activeCode as { attempts: number }).attempts,
          }
        : null,
      displayNumber: await getDisplayNumber(),
    };
  });

export const startWhatsAppLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => phoneSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Gating por tier: WhatsApp só a partir de 'consultor'.
    // 'base' fica em Telegram (Nível 0). Beta activo => 'hub' via effective_tier.
    const { data: tierRaw } = await context.supabase.rpc("effective_tier", {
      _user_id: context.userId,
    });
    const tier = normalizeTier(tierRaw as string | null);
    if (!canUseWhatsApp(tier)) {
      throw new Error(
        `WhatsApp disponível a partir do plano Consultor. O teu plano actual é ${tierLabel(tier)}. Podes continuar a usar o Assessor pelo Telegram.`,
      );
    }

    const normalized = normalizePhone(data.phone);
    if (!normalized || normalized.length < 8 || normalized.length > 15) {
      throw new Error("Número inválido. Usa formato internacional, por exemplo +351912345678.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Reject if this exact number is already linked to another account.
    const { data: taken } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone", normalized)
      .eq("whatsapp_link_status", "linked")
      .neq("id", context.userId);
    if (taken && taken.length > 0) {
      throw new Error("Este número já está associado a outra conta.");
    }

    // Save phone + mark pending.
    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({
        phone: normalized,
        whatsapp_link_status: "pending",
        phone_verified_at: null,
        whatsapp_linked_at: null,
      } as never)
      .eq("id", context.userId);
    if (profErr) throw new Error(profErr.message);

    // Invalidate any previous active codes for this user.
    await supabaseAdmin
      .from("whatsapp_link_codes")
      .update({ used_at: new Date().toISOString() } as never)
      .eq("user_id", context.userId)
      .is("used_at", null);

    const { generateLinkCode, hashLinkCode } = await import("./link-code.server");
    const code = generateLinkCode();
    const expiresAt = new Date(Date.now() + WHATSAPP_CODE_TTL_MIN * 60_000).toISOString();
    const { error: insErr } = await supabaseAdmin
      .from("whatsapp_link_codes")
      .insert({
        user_id: context.userId,
        phone: normalized,
        code_hash: hashLinkCode(code),
        expires_at: expiresAt,
      } as never);
    if (insErr) throw new Error(insErr.message);

    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: context.userId,
      action: "whatsapp.link_started",
      target_user_id: context.userId,
      resource_type: "whatsapp",
      metadata: { phone: normalized } as never,
    } as never);

    return {
      code,
      expiresAt,
      phone: normalized,
      displayNumber: await getDisplayNumber(),
    };
  });

export const unlinkWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ keepPhone: z.boolean().default(true) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {
      whatsapp_link_status: "unlinked",
      whatsapp_linked_at: null,
      phone_verified_at: null,
    };
    if (!data.keepPhone) patch.phone = null;
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(patch as never)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);

    // Sem WhatsApp, o canal principal volta ao Telegram (se estiver ligado).
    await supabaseAdmin
      .from("channel_links")
      .delete()
      .eq("channel", "whatsapp")
      .eq("user_id", context.userId);
    const { recomputePrimaryChannel } = await import("@/lib/assessor/primary-channel.server");
    await recomputePrimaryChannel(supabaseAdmin, context.userId);

    await supabaseAdmin
      .from("whatsapp_link_codes")
      .update({ used_at: new Date().toISOString() } as never)
      .eq("user_id", context.userId)
      .is("used_at", null);

    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: context.userId,
      action: "whatsapp.unlink",
      target_user_id: context.userId,
      resource_type: "whatsapp",
      metadata: { keepPhone: data.keepPhone } as never,
    } as never);
    return { ok: true };
  });