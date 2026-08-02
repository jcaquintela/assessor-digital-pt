import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  return roles;
}

async function assertSuperAdmin(supabase: any, userId: string) {
  const roles = await getRoles(supabase, userId);
  if (!roles.includes("super_admin")) throw new Error("Forbidden: super admin only");
  return roles;
}

// Auditoria obrigatória para criar/alterar/desativar acessos.
export async function auditAccess(
  adminId: string,
  action: string,
  opts: {
    target_user_id?: string | null;
    resource_type?: string | null;
    resource_id?: string | null;
    reason?: string | null;
    before?: unknown;
    after?: unknown;
    metadata?: Record<string, unknown>;
  } = {},
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("admin_audit_logs").insert({
    admin_user_id: adminId,
    action,
    target_user_id: opts.target_user_id ?? null,
    resource_type: opts.resource_type ?? null,
    resource_id: opts.resource_id ?? null,
    reason: opts.reason ?? null,
    metadata: {
      ...(opts.metadata ?? {}),
      before: opts.before ?? null,
      after: opts.after ?? null,
    } as any,
  } as never);
}

export type AccessUser = {
  id: string;
  email: string;
  name: string | null;
  tier: string;
  is_beta_tester: boolean;
  beta_expires_at: string | null;
  channel: string;
  role: Role;
  state: "active" | "inactive" | "test";
  created_at: string;
};

const TEST_MARKERS = ["ci-", "test.assessor.local"];

export const listAccessUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccessUser[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const users = authList?.users ?? [];
    const ids = users.map((u) => u.id);
    const guard = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
    const [{ data: profs }, { data: roles }, { data: links }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, name, subscription_tier, is_beta_tester, beta_expires_at, whatsapp_link_status, primary_channel")
        .in("id", guard),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", guard),
      supabaseAdmin.from("channel_links").select("user_id, channel").in("user_id", guard),
    ]);
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    const roleMap = new Map<string, Role[]>();
    (roles ?? []).forEach((r: any) => {
      roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
    });
    const linkMap = new Map<string, string>();
    (links ?? []).forEach((l: any) => linkMap.set(l.user_id, l.channel));

    return users.map((u) => {
      const p: any = profMap.get(u.id) ?? {};
      const rs = roleMap.get(u.id) ?? ["consultant"];
      const role: Role = rs.includes("super_admin")
        ? "super_admin"
        : rs.includes("support_admin")
          ? "support_admin"
          : "consultant";
      const email = u.email ?? "";
      const isTest = TEST_MARKERS.some((m) => email.includes(m));
      const banned = !!(u as any).banned_until;
      const channel =
        linkMap.get(u.id) === "telegram"
          ? "Telegram"
          : p.whatsapp_link_status === "linked"
            ? "WhatsApp"
            : "—";
      return {
        id: u.id,
        email,
        name: p.name ?? null,
        tier: p.subscription_tier ?? "base",
        is_beta_tester: !!p.is_beta_tester,
        beta_expires_at: p.beta_expires_at ?? null,
        channel,
        role,
        state: banned ? "inactive" : isTest ? "test" : "active",
        created_at: u.created_at,
      } satisfies AccessUser;
    });
  });

const tierSchema = z.enum(["base", "consultor", "pro", "hub"]);

/* ---------------- Contas possivelmente duplicadas ---------------- */
// Só sinaliza — nunca funde. Homónimos existem; a decisão é humana.

export type DuplicateAccountAlert = {
  key: string;
  name: string;
  reason: "shadow_account" | "same_name_other_channel";
  accounts: {
    id: string;
    email: string;
    name: string | null;
    tier: string;
    channels: string[];
    created_at: string;
    activity: number;
  }[];
};

function normName(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export const listDuplicateAccountAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DuplicateAccountAlert[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profs }, { data: links }, { data: msgs }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, name, email, subscription_tier, created_at"),
      supabaseAdmin.from("channel_links").select("user_id, channel"),
      supabaseAdmin.from("assessor_messages").select("user_id"),
    ]);

    const chanMap = new Map<string, string[]>();
    (links ?? []).forEach((l: any) => {
      chanMap.set(l.user_id, [...(chanMap.get(l.user_id) ?? []), l.channel]);
    });
    const actMap = new Map<string, number>();
    (msgs ?? []).forEach((m: any) => {
      if (m.user_id) actMap.set(m.user_id, (actMap.get(m.user_id) ?? 0) + 1);
    });

    const rows = (profs ?? []).map((p: any) => ({
      id: p.id as string,
      email: (p.email ?? "") as string,
      name: (p.name ?? null) as string | null,
      tier: (p.subscription_tier ?? "base") as string,
      channels: chanMap.get(p.id) ?? [],
      created_at: p.created_at as string,
      activity: actMap.get(p.id) ?? 0,
    }));

    const alerts: DuplicateAccountAlert[] = [];

    // 1) Qualquer conta-sombra que ainda exista é, por definição, suspeita.
    for (const r of rows) {
      if (!r.email.endsWith("@shadow.assessor.local")) continue;
      const twins = rows.filter((o) => o.id !== r.id && normName(o.name) && normName(o.name) === normName(r.name));
      alerts.push({
        key: `shadow:${r.id}`,
        name: r.name ?? r.email,
        reason: "shadow_account",
        accounts: [r, ...twins],
      });
    }

    // 2) Mesmo nome em contas distintas com canais diferentes.
    const byName = new Map<string, typeof rows>();
    for (const r of rows) {
      const n = normName(r.name);
      if (!n) continue;
      byName.set(n, [...(byName.get(n) ?? []), r]);
    }
    for (const [n, group] of byName) {
      if (group.length < 2) continue;
      if (group.some((g) => g.email.endsWith("@shadow.assessor.local"))) continue; // já coberto acima
      const channels = new Set(group.flatMap((g) => g.channels));
      if (channels.size < 2) continue;
      alerts.push({
        key: `name:${n}`,
        name: group[0].name ?? n,
        reason: "same_name_other_channel",
        accounts: group,
      });
    }

    return alerts.sort((a, b) => a.name.localeCompare(b.name, "pt"));
  });

const createSchema = z.object({
  email: z.string().trim().email().max(255),
  subscription_tier: tierSchema,
  is_beta_tester: z.boolean().optional(),
  beta_expires_at: z.string().nullable().optional(),
  name: z.string().trim().max(120).optional(),
});

// Mesmo mecanismo usado para subir uma conta manualmente a Team/beta:
// cria o utilizador em auth e escreve o tier em profiles. Sem checkout.
export const createAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      email_confirm: true,
      user_metadata: { name: data.name ?? data.email.split("@")[0], source: "admin_created" },
    });
    if (error || !created?.user?.id) {
      throw new Error(error?.message ?? "Não foi possível criar a conta.");
    }
    const userId = created.user.id;
    const after = {
      subscription_tier: data.subscription_tier,
      is_beta_tester: data.is_beta_tester ?? false,
      beta_expires_at: data.beta_expires_at || null,
    };
    await supabaseAdmin.from("profiles").update(after as never).eq("id", userId);
    await auditAccess(context.userId, "user.access_created", {
      target_user_id: userId,
      resource_type: "profile",
      resource_id: userId,
      before: null,
      after: { email: data.email, ...after },
    });
    return { ok: true, userId };
  });

const updateSchema = z.object({
  target_user_id: z.string().uuid(),
  subscription_tier: tierSchema.optional(),
  is_beta_tester: z.boolean().optional(),
  beta_expires_at: z.string().nullable().optional(),
  reason: z.string().max(280).optional(),
});

export const updateAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin
      .from("profiles")
      .select("subscription_tier, is_beta_tester, beta_expires_at")
      .eq("id", data.target_user_id)
      .maybeSingle();

    const patch: Record<string, unknown> = {};
    if (data.subscription_tier !== undefined) patch.subscription_tier = data.subscription_tier;
    if (data.is_beta_tester !== undefined) patch.is_beta_tester = data.is_beta_tester;
    if (data.beta_expires_at !== undefined) patch.beta_expires_at = data.beta_expires_at || null;
    if (!Object.keys(patch).length) return { ok: true, unchanged: true };

    const { error } = await supabaseAdmin
      .from("profiles")
      .update(patch as never)
      .eq("id", data.target_user_id);
    if (error) throw new Error(error.message);

    await auditAccess(context.userId, "user.access_updated", {
      target_user_id: data.target_user_id,
      resource_type: "profile",
      resource_id: data.target_user_id,
      reason: data.reason ?? null,
      before: before ?? null,
      after: { ...(before ?? {}), ...patch },
    });

    // Subiu de base para plano pago: avisa pelo canal principal.
    if (data.subscription_tier !== undefined) {
      const beforeTier = String((before as any)?.subscription_tier ?? "");
      const afterTier = String(data.subscription_tier ?? "");
      if (beforeTier !== afterTier) {
        const { recordSubscriptionEvent } = await import("@/lib/subscription/events.server");
        const paid = (t: string) => t === "consultor" || t === "pro" || t === "hub";
        if (!paid(beforeTier) && paid(afterTier)) {
          await recordSubscriptionEvent(supabaseAdmin, {
            userId: data.target_user_id, event: "base_to_paid",
            fromTier: beforeTier, toTier: afterTier, source: "admin",
          });
        } else if (paid(beforeTier) && !paid(afterTier)) {
          await recordSubscriptionEvent(supabaseAdmin, {
            userId: data.target_user_id, event: "paid_to_base",
            fromTier: beforeTier, toTier: afterTier, source: "admin",
          });
        }
      }
      const { isUpgradeToPaid, notifyPlanActivatedSafe } = await import(
        "@/lib/subscription/plan-activated.server"
      );
      if (isUpgradeToPaid((before as any)?.subscription_tier, data.subscription_tier)) {
        await notifyPlanActivatedSafe(supabaseAdmin, data.target_user_id, data.subscription_tier);
        const { startWhatsAppTrialIfEligibleSafe } = await import("@/lib/subscription/trial.server");
        await startWhatsAppTrialIfEligibleSafe(supabaseAdmin, data.target_user_id, data.subscription_tier);
      }
    }
    return { ok: true };
  });

const deactivateSchema = z.object({
  target_user_id: z.string().uuid(),
  reason: z.string().max(280).optional(),
});

// "Eliminar" = desativar. A conta perde acesso, os dados ficam.
// Hard-delete não está implementado de propósito.
export const deactivateAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deactivateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    if (context.userId === data.target_user_id) {
      throw new Error("Não é permitido desativar a sua própria conta.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.target_user_id, {
      ban_duration: "876000h",
    });
    if (error) throw new Error(error.message);
    await auditAccess(context.userId, "user.access_deactivated", {
      target_user_id: data.target_user_id,
      resource_type: "auth_user",
      resource_id: data.target_user_id,
      reason: data.reason ?? null,
      before: { state: "active" },
      after: { state: "inactive", data_retained: true },
    });
    return { ok: true };
  });

export const reactivateAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deactivateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.target_user_id, {
      ban_duration: "none",
    });
    if (error) throw new Error(error.message);
    await auditAccess(context.userId, "user.access_reactivated", {
      target_user_id: data.target_user_id,
      resource_type: "auth_user",
      resource_id: data.target_user_id,
      reason: data.reason ?? null,
      before: { state: "inactive" },
      after: { state: "active" },
    });
    return { ok: true };
  });

// ------------------------------ Códigos promocionais ----------------------

export type PromoCodeRow = {
  id: string;
  code: string;
  grants_tier: string;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  active: boolean;
  note: string | null;
  created_at: string;
};

export const listPromoCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PromoCodeRow[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("promo_codes")
      .select("id, code, grants_tier, max_uses, used_count, expires_at, active, note, created_at")
      .order("created_at", { ascending: false });
    return (data ?? []) as PromoCodeRow[];
  });

export const createPromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9._-]+$/, "Código inválido"),
        grants_tier: tierSchema,
        max_uses: z.number().int().min(1).max(10000),
        expires_at: z.string().nullable().optional(),
        note: z.string().trim().max(160).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = data.code.toUpperCase();
    const { error } = await supabaseAdmin.from("promo_codes").insert({
      code,
      grants_tier: data.grants_tier,
      max_uses: data.max_uses,
      expires_at: data.expires_at || null,
      note: data.note || null,
      created_by: context.userId,
    } as never);
    if (error) throw new Error(error.message.includes("duplicate") ? "Já existe um código com esse nome." : error.message);
    await auditAccess(context.userId, "promo_code.created", {
      resource_type: "promo_code",
      resource_id: code,
      before: null,
      after: { code, grants_tier: data.grants_tier, max_uses: data.max_uses, expires_at: data.expires_at || null },
    });
    return { ok: true };
  });

export const revokePromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin
      .from("promo_codes")
      .select("code, active")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("promo_codes")
      .update({ active: false } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditAccess(context.userId, "promo_code.revoked", {
      resource_type: "promo_code",
      resource_id: (before as any)?.code ?? data.id,
      before: before ?? null,
      after: { ...(before ?? {}), active: false },
    });
    return { ok: true };
  });