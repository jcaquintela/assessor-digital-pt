import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { auditAccess } from "@/lib/admin/acessos.functions";

type Role = "consultant" | "support_admin" | "super_admin";

async function getRoles(supabase: any, userId: string): Promise<Role[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role as Role);
}
async function assertAdmin(supabase: any, userId: string) {
  const roles = await getRoles(supabase, userId);
  if (!roles.includes("super_admin") && !roles.includes("support_admin")) {
    throw new Error("Forbidden: admin only");
  }
}
async function assertSuperAdmin(supabase: any, userId: string) {
  const roles = await getRoles(supabase, userId);
  if (!roles.includes("super_admin")) throw new Error("Forbidden: super admin only");
}

const tierSchema = z.enum(["base", "consultor", "pro", "hub"]);

export type BetaTester = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  channel: string;
  tier: string;
  started_at: string;
  expires_at: string | null;
  days_left: number | null;
};

export const listBetaTesters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BetaTester[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email, phone, subscription_tier, beta_expires_at, created_at, whatsapp_link_status")
      .eq("is_beta_tester", true);
    const rows = (profs ?? []) as any[];
    const ids = rows.map((r) => r.id);
    const guard = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
    const { data: links } = await supabaseAdmin
      .from("channel_links")
      .select("user_id, channel")
      .in("user_id", guard);
    const linkMap = new Map<string, string[]>();
    (links ?? []).forEach((l: any) => {
      linkMap.set(l.user_id, [...(linkMap.get(l.user_id) ?? []), l.channel]);
    });

    const now = Date.now();
    return rows
      .map((p) => {
        const chans = linkMap.get(p.id) ?? [];
        const channel =
          p.whatsapp_link_status === "linked" || chans.includes("whatsapp")
            ? "WhatsApp"
            : chans.includes("telegram")
              ? "Telegram"
              : "—";
        const days_left = p.beta_expires_at
          ? Math.ceil((new Date(p.beta_expires_at).getTime() - now) / 86400000)
          : null;
        return {
          id: p.id,
          name: p.name ?? null,
          email: p.email ?? null,
          phone: p.phone ?? null,
          channel,
          tier: p.subscription_tier ?? "base",
          started_at: p.created_at,
          expires_at: p.beta_expires_at ?? null,
          days_left,
        } satisfies BetaTester;
      })
      .sort((a, b) => {
        const av = a.expires_at ? new Date(a.expires_at).getTime() : Infinity;
        const bv = b.expires_at ? new Date(b.expires_at).getTime() : Infinity;
        return av - bv;
      });
  });

async function readProfile(supabaseAdmin: any, id: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("subscription_tier, is_beta_tester, beta_expires_at")
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

// Estender: soma dias ao prazo actual (ou a partir de agora, se já passou).
export const extendBeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ target_user_id: z.string().uuid(), days: z.number().int().min(1).max(365) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before: any = await readProfile(supabaseAdmin, data.target_user_id);
    const base = before?.beta_expires_at ? new Date(before.beta_expires_at).getTime() : 0;
    const from = Math.max(base, Date.now());
    const next = new Date(from + data.days * 86400000).toISOString();
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ beta_expires_at: next, is_beta_tester: true } as never)
      .eq("id", data.target_user_id);
    if (error) throw new Error(error.message);
    await auditAccess(context.userId, "beta.extended", {
      target_user_id: data.target_user_id,
      resource_type: "profile",
      resource_id: data.target_user_id,
      before,
      after: { ...(before ?? {}), beta_expires_at: next, is_beta_tester: true },
      metadata: { days: data.days },
    });
    return { ok: true, expires_at: next };
  });

// Terminar agora: volta a Base imediatamente.
export const endBetaNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ target_user_id: z.string().uuid(), reason: z.string().max(280).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before: any = await readProfile(supabaseAdmin, data.target_user_id);
    const after = {
      subscription_tier: "base",
      is_beta_tester: false,
      beta_expires_at: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(after as never)
      .eq("id", data.target_user_id);
    if (error) throw new Error(error.message);
    await auditAccess(context.userId, "beta.ended", {
      target_user_id: data.target_user_id,
      resource_type: "profile",
      resource_id: data.target_user_id,
      reason: data.reason ?? null,
      before,
      after,
    });
    return { ok: true };
  });

// Converter: deixa de ser beta, mantém o plano actual como permanente.
export const convertBeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        target_user_id: z.string().uuid(),
        subscription_tier: tierSchema.optional(),
        reason: z.string().max(280).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before: any = await readProfile(supabaseAdmin, data.target_user_id);
    const tier = data.subscription_tier ?? (before?.subscription_tier ?? "base");
    const after = { subscription_tier: tier, is_beta_tester: false, beta_expires_at: null };
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(after as never)
      .eq("id", data.target_user_id);
    if (error) throw new Error(error.message);
    await auditAccess(context.userId, "beta.converted", {
      target_user_id: data.target_user_id,
      resource_type: "profile",
      resource_id: data.target_user_id,
      reason: data.reason ?? null,
      before,
      after,
    });
    return { ok: true, tier };
  });

/* ----------------------- Criação em lote de convites ---------------------- */

const inviteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  whatsapp: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().max(255).optional().or(z.literal("")),
  tier: tierSchema,
  days: z.number().int().min(1).max(365),
});

export type BetaInviteResult = {
  name: string;
  whatsapp: string | null;
  email: string | null;
  tier: string;
  days: number;
  code: string;
};

function slug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 6) || "BETA";
}

function randomSuffix(): string {
  const chars = "ACDEFGHJKLMNPQRTUVWXY3456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export const createBetaInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ invites: z.array(inviteSchema).min(1).max(50) }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; codes: BetaInviteResult[] }> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const codes: BetaInviteResult[] = [];
    for (const inv of data.invites) {
      let code = "";
      for (let attempt = 0; attempt < 6; attempt++) {
        const candidate = `BETA-${slug(inv.name)}-${randomSuffix()}`;
        const { error } = await supabaseAdmin.from("promo_codes").insert({
          code: candidate,
          grants_tier: inv.tier,
          max_uses: 1,
          created_by: context.userId,
          note: `Beta ${inv.days} dias — ${inv.name}`,
          is_beta: true,
          beta_days: inv.days,
          invitee_name: inv.name,
          invitee_whatsapp: inv.whatsapp || null,
          invitee_email: inv.email || null,
        } as never);
        if (!error) {
          code = candidate;
          break;
        }
        if (!error.message.toLowerCase().includes("duplicate")) throw new Error(error.message);
      }
      if (!code) throw new Error(`Não foi possível gerar código para ${inv.name}.`);
      await auditAccess(context.userId, "beta.invite_created", {
        resource_type: "promo_code",
        resource_id: code,
        before: null,
        after: { code, tier: inv.tier, days: inv.days, name: inv.name },
      });
      codes.push({
        name: inv.name,
        whatsapp: inv.whatsapp || null,
        email: inv.email || null,
        tier: inv.tier,
        days: inv.days,
        code,
      });
    }
    return { ok: true, codes };
  });

// Corre a expiração à mão (o cron faz o mesmo automaticamente).
export const runBetaExpiryNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { expireDueBetaTesters } = await import("@/lib/admin/beta.server");
    return await expireDueBetaTesters(supabaseAdmin);
  });
